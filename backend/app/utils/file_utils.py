"""File utility functions."""
import os

ALLOWED_EXTENSIONS = {'pdf', 'epub', 'mobi', 'txt', 'docx'}


def allowed_file(filename):
    """Check if a file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_extension(filename):
    """Get the file extension from a filename."""
    if '.' in filename:
        return filename.rsplit('.', 1)[1].lower()
    return None


def generate_safe_filename(filename, user_id):
    """Generate a safe filename with user ID prefix."""
    import uuid
    from werkzeug.utils import secure_filename
    
    base_name = secure_filename(filename)
    ext = get_file_extension(base_name)
    
    if ext:
        return f"{user_id}_{uuid.uuid4()}.{ext}"
    else:
        return f"{user_id}_{uuid.uuid4()}" 