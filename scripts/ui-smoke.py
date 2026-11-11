"""Run current UI checks against the isolated audit server on port 8766."""
from pathlib import Path
import runpy
for script in ['audit-ui-smoke.py', 'audit-ui-reading.py', 'audit-ui-navigation.py', 'translation-ui-smoke.py']:
    runpy.run_path(str(Path(__file__).with_name(script)), run_name='__main__')
