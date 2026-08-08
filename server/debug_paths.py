from config import get_settings
settings = get_settings()
print(f"CURRICULUM ROOT: {settings.library_curriculum_root}")
print(f"HISTORY ROOT: {settings.library_history_root}")
print(f"Exists? CV: {settings.library_curriculum_root.exists() if settings.library_curriculum_root else 'N/A'}")
print(f"Exists? HS: {settings.library_history_root.exists() if settings.library_history_root else 'N/A'}")
