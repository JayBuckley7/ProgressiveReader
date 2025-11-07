"""Quick test to verify font registration works."""
import fitz

doc = fitz.open()
page = doc.new_page()
font_path = r"C:\WINDOWS\Fonts\YuGothR.ttc"

try:
    # Register font
    xref = page.insert_font(fontname="cjk", fontfile=font_path)
    print(f"Font registered, xref: {xref}")
    
    # Try to insert text
    page.insert_text((10, 50), "テスト", fontname="cjk", fontsize=12)
    print("Success! Text inserted with registered font")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

doc.close()

