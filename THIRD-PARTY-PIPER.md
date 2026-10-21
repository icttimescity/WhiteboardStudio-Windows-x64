# Piper TTS integration notices

This project invokes the separately installed `piper-tts==1.3.0` package via its Python API.
Piper source and license: https://github.com/OHF-Voice/piper1-gpl (GPL-3.0).
ONNX Runtime and eSpeak NG are dependencies of the installed engine; retain their package notices.

Voice assets are not embedded in this source archive. The explicit setup command downloads assets from https://huggingface.co/rhasspy/piper-voices and saves each voice's upstream MODEL_CARD next to the model. Voice/dataset terms are separate from the engine license.

- vi_VN-vais1000-medium: VAIS1000 Vietnamese corpus. Upstream model card lists dataset CC BY 4.0 and fine-tuning from Lessac medium.
  https://huggingface.co/rhasspy/piper-voices/blob/main/vi/vi_VN/vais1000/medium/MODEL_CARD
- en_US-lessac-medium: Lessac / Blizzard Challenge 2013 corpus. Upstream model card links its dataset license:
  https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html
  https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD

Do not assume all voice assets share a single license; review the linked voice terms for your intended distribution/use.


## Added in 1.2.0
- Vietnamese multi-speaker model by CakeByVPBank: https://huggingface.co/CakeByVPBank/piper-pgl-v4-vi_VN-version39_epoch39
  Pinned revision: 8ea50134bea762f6a1faac671e1a33c41871289c. Upstream model card declares MIT. Speaker 2: Quang Huy (male); speaker 0: Ngoc Lan (female). The setup retains upstream README as Cake-MODEL_CARD.md. Attribution: CakeByVPBank, Michael Hansen / Piper TTS, rhasspy/piper-voices, OHF-Voice/piper1-gpl.
- English male: rhasspy/piper-voices en_US-hfc_male-medium; setup retains its MODEL_CARD. Review its voice-specific dataset terms separately.
