
import re
import json
from google.cloud import vision
from typing import Dict, List, Any

def extract_text_from_image(image_file) -> Dict[str, Any]:
    """
    Extract text from an uploaded image using Google Vision OCR.

    Args:
        image_file: Uploaded image file (BytesIO or similar)

    Returns:
        dict: Dictionary containing 'full_text', 'return_address', and 'raw_response'
    """
    try:
        client = vision.ImageAnnotatorClient()
        content = image_file.read()
        image = vision.Image(content=content)
        response = client.text_detection(image=image)
        texts = response.text_annotations

        if texts:
            full_text = texts[0].description

            # Try to extract return address (typically at the top of envelope)
            lines = full_text.split('\n')
            return_address_lines = []

            # Look for common return address patterns (first few lines, postal codes, etc.)
            for i, line in enumerate(lines[:5]):  # Check first 5 lines
                line = line.strip()
                if not line:
                    continue

                # Look for postal code patterns (US zip codes)
                if re.search(r'\b\d{5}(-\d{4})?\b', line):
                    # Include this line and previous lines as return address
                    return_address_lines = lines[:i+1]
                    break
                elif i < 3:  # First 3 lines are likely return address
                    return_address_lines.append(line)

            return_address = '\n'.join(return_address_lines) if return_address_lines else "Return address not detected"

            # Convert response to dictionary for JSON serialization
            raw_response = {
                'text_annotations': [
                    {
                        'description': text.description,
                        'bounding_poly': {
                            'vertices': [
                                {'x': vertex.x, 'y': vertex.y}
                                for vertex in text.bounding_poly.vertices
                            ]
                        } if text.bounding_poly else None,
                        'locale': text.locale if hasattr(text, 'locale') else None
                    }
                    for text in texts
                ],
                'full_text_annotation': {
                    'text': response.full_text_annotation.text if response.full_text_annotation else None,
                    'pages': [
                        {
                            'width': page.width,
                            'height': page.height,
                            'blocks': [
                                {
                                    'bounding_box': {
                                        'vertices': [
                                            {'x': v.x, 'y': v.y}
                                            for v in block.bounding_box.vertices
                                        ]
                                    } if block.bounding_box else None,
                                    'paragraphs': [
                                        {
                                            'bounding_box': {
                                                'vertices': [
                                                    {'x': v.x, 'y': v.y}
                                                    for v in para.bounding_box.vertices
                                                ]
                                            } if para.bounding_box else None,
                                            'words': [
                                                {
                                                    'bounding_box': {
                                                        'vertices': [
                                                            {'x': v.x, 'y': v.y}
                                                            for v in word.bounding_box.vertices
                                                        ]
                                                    } if word.bounding_box else None,
                                                    'symbols': [
                                                        {
                                                            'text': symbol.text,
                                                            'bounding_box': {
                                                                'vertices': [
                                                                    {'x': v.x, 'y': v.y}
                                                                    for v in symbol.bounding_box.vertices
                                                                ]
                                                            } if symbol.bounding_box else None
                                                        }
                                                        for symbol in word.symbols
                                                    ]
                                                }
                                                for word in para.words
                                            ]
                                        }
                                        for para in block.paragraphs
                                    ]
                                }
                                for block in page.blocks
                            ]
                        }
                        for page in response.full_text_annotation.pages
                    ] if response.full_text_annotation else []
                } if response.full_text_annotation else None
            }

            return {
                'full_text': full_text,
                'return_address': return_address,
                'raw_response': raw_response
            }
        else:
            return {
                'full_text': "No text found",
                'return_address': "No text found",
                'raw_response': {'text_annotations': [], 'full_text_annotation': None}
            }
    except Exception as e:
        error_msg = f"OCR Error: {str(e)}"
        return {
            'full_text': error_msg,
            'return_address': error_msg,
            'raw_response': {'error': error_msg}
        }
