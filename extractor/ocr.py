import sys
import os
import json
import warnings
import logging

# Suppress all warnings and noisy logs before importing paddle
warnings.filterwarnings("ignore")
os.environ["FLAGS_use_mkldnn"] = "0"
logging.disable(logging.WARNING)

from paddleocr import PaddleOCR
from PIL import Image, ImageEnhance, ImageFilter

CONFIDENCE_THRESHOLD = 0.75

def preprocess_image(image_path):
    """Simple upscale + light sharpen for better OCR accuracy."""
    img = Image.open(image_path)
    
    # Upscale 2x so small text becomes readable
    w, h = img.size
    img = img.resize((w * 2, h * 2), Image.LANCZOS)
    
    # Convert to RGB if needed (some PNGs are RGBA)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Light sharpen only
    img = ImageEnhance.Sharpness(img).enhance(1.3)
    
    preprocessed_path = image_path.replace('.png', '_preprocessed.png')
    img.save(preprocessed_path)
    return preprocessed_path

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
        
    image_path = sys.argv[1]
    preprocessed_path = None
    
    try:
        # Pre-process for better accuracy
        preprocessed_path = preprocess_image(image_path)
        
        # PaddleOCR 2.7.x API
        ocr = PaddleOCR(
            use_angle_cls=True,
            lang='en',
            show_log=False,
            use_gpu=False,
            enable_mkldnn=False,
            det_db_thresh=0.3,      # Lower detection threshold to catch more text
            det_db_box_thresh=0.5,  # Box confidence threshold
        )
        result = ocr.ocr(preprocessed_path, cls=True)
        
        extracted_data = []
        if result and result[0]:
            for line in result[0]:
                box = line[0]
                text = line[1][0]
                confidence = line[1][1]
                
                # Filter out low-confidence noise
                if confidence < CONFIDENCE_THRESHOLD:
                    continue
                
                # Skip very short garbage strings (1-2 chars that aren't meaningful)
                if len(text.strip()) <= 1 and not text.strip().isalnum():
                    continue
                
                extracted_data.append({
                    "box": box,
                    "text": text.strip(),
                    "confidence": float(confidence)
                })
        
        print(json.dumps({"success": True, "data": extracted_data}))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    finally:
        # Clean up preprocessed image
        if preprocessed_path and os.path.exists(preprocessed_path):
            os.remove(preprocessed_path)

if __name__ == "__main__":
    main()
