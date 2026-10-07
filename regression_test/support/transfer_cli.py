"""Execute the packaged transfer CLI; keep capabilities out of OS process arguments."""
import json,os,pathlib,runpy,sys
value=json.load(sys.stdin)
if value.get('discoveryFile'):os.environ['COLAB_DISCOVERY_FILE']=value['discoveryFile']
sys.argv=['colab-transfer','receive','--capability',value['capability']]
runpy.run_path(str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/bin/colab-transfer'),run_name='__main__')
