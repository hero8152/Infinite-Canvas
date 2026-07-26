from .data_layout import DataLayout
from .database import CanvasDatabase
from .migration import LegacyMigrator
from .maintenance import MaintenanceManager
from .paths import APP_PATHS
from .secrets import SecretStore


DATA_LAYOUT = DataLayout.from_app_paths(APP_PATHS)
DATA_LAYOUT.ensure()

MAINTENANCE = MaintenanceManager(DATA_LAYOUT)
MAINTENANCE_REPORT = MAINTENANCE.run_once()
MAINTENANCE.start()

DATABASE = CanvasDatabase(DATA_LAYOUT.database_file)
DATABASE.initialize()

MIGRATION_REPORT = LegacyMigrator(APP_PATHS, DATA_LAYOUT, DATABASE).run()

SECRET_STORE = SecretStore(DATABASE)
_legacy_secret_files = sorted(DATA_LAYOUT.backups.glob("migration-*/legacy-root/API/.env"))
_legacy_secret_files.append(DATA_LAYOUT.secret_env)
SECRET_MIGRATION_REPORT = SECRET_STORE.import_env_files(_legacy_secret_files)
SECRET_STORE.load_into_environ()
