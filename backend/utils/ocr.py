import pytesseract
from PIL import Image
from pdf2image import convert_from_path
from docx import Document
import os


def extract_text_from_image(file_path):
    text = ""
    ext = os.path.splitext(file_path)[1].lower()

    try:
        # 🖼 IMAGE
        if ext in [".jpg", ".jpeg", ".png"]:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)

        # 📄 PDF
        elif ext == ".pdf":
            images = convert_from_path(file_path)
            for img in images:
                text += pytesseract.image_to_string(img)

        # 📘 DOCX
        elif ext == ".docx":
            doc = Document(file_path)
            for para in doc.paragraphs:
                text += para.text + "\n"

        else:
            text = "Unsupported file type"

    except Exception as e:
        print("OCR ERROR:", e)
        text = ""

    return text