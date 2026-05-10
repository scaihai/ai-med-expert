import os
import logging
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from pydantic import BaseModel, Field
from transformers import (
    BertTokenizer,
    BertForQuestionAnswering,
    pipeline,
)
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_PATH = os.environ.get("MODEL_PATH", "/app/models/fine_tuned/bio_clinical_bert")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333")
COLLECTION_NAME = os.environ.get("COLLECTION_NAME", "pressure_ulcers")
TOP_K = int(os.environ.get("TOP_K", "10"))

logger = logging.getLogger("model-server")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Global handles (populated on startup)
# ---------------------------------------------------------------------------
qa_pipeline = None
embedder = None
qdrant = None

def embed_query(text: str) -> list[float]:
    """
    Encode text into a 384-dim vector using the dedicated embedding model.
    """
    return embedder.encode(text).tolist()

# ---------------------------------------------------------------------------
# Lifespan: load models + connect to Qdrant once on startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global qa_pipeline, embedder, qdrant

    # 1. Load the QA Model (Reader)
    logger.info("Loading QA model from %s …", MODEL_PATH)
    tokenizer = BertTokenizer.from_pretrained(MODEL_PATH)
    model = BertForQuestionAnswering.from_pretrained(MODEL_PATH)
    model.eval()

    qa_pipeline = pipeline(
        "question-answering",
        model=model,
        tokenizer=tokenizer,
        device=0 if torch.cuda.is_available() else -1
    )
    logger.info("QA pipeline ready.")

    # 2. Load the Embedding Model (Retriever)
    logger.info("Loading Embedding model %s …", EMBEDDING_MODEL)
    embedder = SentenceTransformer(
        EMBEDDING_MODEL,
        device="cuda" if torch.cuda.is_available() else "cpu",
    )
    logger.info("Embedding model ready.")

    # 3. Connect to Qdrant
    logger.info("Connecting to Qdrant at %s …", QDRANT_URL)
    qdrant = QdrantClient(url=QDRANT_URL, timeout=30)
    collection_info = qdrant.get_collection(COLLECTION_NAME)
    logger.info(
        "Qdrant collection '%s' has %d points.",
        COLLECTION_NAME,
        collection_info.points_count,
    )

    yield  # Application runs here

    logger.info("Shutting down …")

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(title="Pressure Ulcer QA – Model Server", lifespan=lifespan)

class PredictRequest(BaseModel):
    question: str
    confidence_threshold: float = Field(
        default=80.0,
        ge=0,
        le=100,
        description="Minimum confidence (0-100%) to return an answer.",
    )

class PredictResponse(BaseModel):
    answer: str
    confidence: int
    context_used: str | None = None

@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    # --- 1. Vector search --------------------------------------------------
    query_vector = embed_query(req.question)

    hits = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=TOP_K,
    )

    if not hits:
        return PredictResponse(
            answer="I could not find any relevant information in the knowledge base.",
            confidence=0,
        )

    # --- 2 & 3. Extractive QA on individual chunks --------------------------
    best_answer = None
    best_score = -1.0
    best_context = ""

    for hit in hits:
        payload = hit.payload or {}
        chunk_text = payload.get("context") or payload.get("text_chunk") or payload.get("text") or ""
        
        if not chunk_text.strip():
            continue
            
        logger.info(f"Evaluating DB chunk with vector search score: {hit.score:.4f}")
        
        try:
            # Run inference strictly on the current chunk
            result = qa_pipeline(question=req.question, context=chunk_text)
            
            # Compare and store if this is the most confident answer so far
            if result["score"] > best_score:
                best_score = result["score"]
                best_answer = result["answer"]
                best_context = chunk_text
                
        except Exception as exc:
            # Log the exception for the specific chunk but continue evaluating the rest
            logger.warning("QA pipeline error on individual chunk: %s", exc)
            continue

    # Handle edge case where all chunks failed or were empty
    if best_answer is None:
        return PredictResponse(
            answer="Retrieved documents contained no usable text or inference failed across all chunks.",
            confidence=0,
        )

    score_pct = int(round(best_score * 100))

    # --- 4. Apply confidence threshold ------------------------------------
    if score_pct < req.confidence_threshold:
        return PredictResponse(
            answer="I don't have enough information to answer that question confidently.",
            confidence=score_pct,
            context_used=best_context[:500],
        )

    return PredictResponse(
        answer=best_answer,
        confidence=score_pct,
        context_used=best_context[:500],
    )

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": qa_pipeline is not None and embedder is not None}