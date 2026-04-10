import sys
import os
import json
import warnings
import logging

warnings.filterwarnings("ignore")
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
logging.disable(logging.WARNING)

from paddleocr import PaddleOCR
from PIL import Image, ImageEnhance

CONFIDENCE_THRESHOLD = 0.75

def preprocess_image(image_path):
    """Upscale + light sharpen for better OCR accuracy."""
    img = Image.open(image_path)
    w, h = img.size
    img = img.resize((w * 2, h * 2), Image.LANCZOS)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    img = ImageEnhance.Sharpness(img).enhance(1.3)
    preprocessed_path = image_path.rsplit('.', 1)[0] + '_preprocessed.png'
    img.save(preprocessed_path)
    return preprocessed_path

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)

    image_path = sys.argv[1]
    preprocessed_path = None

    try:
        preprocessed_path = preprocess_image(image_path)

        ocr = PaddleOCR(
            lang='en',
            text_det_thresh=0.3,
            text_det_box_thresh=0.5,
        )
        results = ocr.predict(preprocessed_path)

        extracted_data = []
        for result in results:
            texts  = result.get('rec_texts', [])
            scores = result.get('rec_scores', [])
            polys  = result.get('rec_polys', [None] * len(texts))

            for text, score, box in zip(texts, scores, polys):
                if score < CONFIDENCE_THRESHOLD:
                    continue
                if len(text.strip()) <= 1 and not text.strip().isalnum():
                    continue
                extracted_data.append({
                    "box": box.tolist() if box is not None else [],
                    "text": text.strip(),
                    "confidence": float(score),
                })

        print(json.dumps({"success": True, "data": extracted_data}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    finally:
        if preprocessed_path and os.path.exists(preprocessed_path):
            os.remove(preprocessed_path)

if __name__ == "__main__":
    main()
