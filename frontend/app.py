import os
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

MODEL_SERVER_URL = os.environ.get("MODEL_SERVER_URL", "http://model-server:8000")


@app.route("/")
def index():
    """Serve the main chat UI."""
    return render_template("index.html")


@app.route("/api/ask", methods=["POST"])
def ask():
    """
    Proxy the user's question to the model server.
    Expects JSON: { "question": str, "confidence_threshold": float }
    Returns the model server's response as-is.
    """
    data = request.get_json()
    if not data or "question" not in data:
        return jsonify({"error": "Missing 'question' field"}), 400

    question = data["question"]
    confidence_threshold = data.get("confidence_threshold", 80)

    try:
        resp = requests.post(
            f"{MODEL_SERVER_URL}/predict",
            json={
                "question": question,
                "confidence_threshold": confidence_threshold,
            },
            timeout=120,
        )
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Model server is unavailable. Please try again later."}), 503
    except requests.exceptions.Timeout:
        return jsonify({"error": "Model server timed out. Please try again."}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Model server error: {str(e)}"}), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8082, debug=True)
