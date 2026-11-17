from pathlib import Path
from pypdf import PdfReader
import json
results=[]
for path in sorted(Path('private/pdf-review').glob('*.pdf')):
    pdf=PdfReader(str(path))
    text='\n'.join(page.extract_text() or '' for page in pdf.pages)
    assert len(text)>100, f'PDF text is not selectable: {path.name}'
    for page in pdf.pages:
        assert abs(float(page.mediabox.width)-595.28)<2
        assert abs(float(page.mediabox.height)-841.89)<2
    if 'compact' in path.name:
        assert len(pdf.pages)>1, f'Long fixture failed: {path.name}'
    results.append({'file':path.name,'pages':len(pdf.pages),'textCharacters':len(text),'A4':True})
assert len(results)==6
Path('docs/PDF_VERIFICATION.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print(json.dumps(results))
