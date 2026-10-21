"""Portable runtime smoke check; executed as a file to avoid Windows shell quoting."""
from piper import PiperVoice
import onnxruntime
print('Piper runtime OK / ONNX Runtime ' + onnxruntime.__version__)
