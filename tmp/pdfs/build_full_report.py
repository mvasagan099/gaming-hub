from pathlib import Path
import re,html
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
ROOT=Path('/Users/lakoffice/Documents/gaming hub')
SRC=Path('/Users/lakoffice/.codex/attachments/637edaed-948e-4274-9098-621e76cbc623/Pasted text.txt')
OUT=ROOT/'output/pdf/Manivasagan_A_Performance_Appraisal_Jul_Oct_2026.pdf'
for n,f in [('Body','Arial.ttf'),('Bold','Arial Bold.ttf')]:pdfmetrics.registerFont(TTFont(n,'/System/Library/Fonts/Supplemental/'+f))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Bold', italic='Body', boldItalic='Bold')
navy=HexColor('#142B42');teal=HexColor('#007F83');ink=HexColor('#26384A');muted=HexColor('#647789');pale=HexColor('#EFF5F7')
styles={
'body':ParagraphStyle('body',fontName='Body',fontSize=10.4,leading=15.3,textColor=ink,spaceAfter=8),
'bullet':ParagraphStyle('bullet',fontName='Body',fontSize=10.4,leading=14.9,textColor=ink,leftIndent=12,firstLineIndent=-9,spaceAfter=3),
'nested':ParagraphStyle('nested',fontName='Body',fontSize=10.4,leading=14.9,textColor=ink,leftIndent=29,firstLineIndent=-9,spaceAfter=3),
'h1':ParagraphStyle('h1',fontName='Bold',fontSize=20,leading=25,textColor=navy,spaceBefore=17,spaceAfter=13,keepWithNext=True),
'h2':ParagraphStyle('h2',fontName='Bold',fontSize=16,leading=21,textColor=navy,spaceBefore=19,spaceAfter=11,keepWithNext=True,borderPadding=8,backColor=pale),
'h3':ParagraphStyle('h3',fontName='Bold',fontSize=11.5,leading=16,textColor=teal,spaceBefore=12,spaceAfter=6,keepWithNext=True),
'meta':ParagraphStyle('meta',fontName='Body',fontSize=11,leading=17,textColor=ink,spaceAfter=3),
'label':ParagraphStyle('label',fontName='Bold',fontSize=10.4,leading=15,textColor=teal,spaceBefore=9,spaceAfter=5,keepWithNext=True),
}
def normalize(t):return t.replace('–','-').replace('—','-').replace('\u2011','-')
def markup(t):
 t=html.escape(normalize(t))
 return re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',t)
lines=SRC.read_text().splitlines();story=[];expected=[]
for i,line in enumerate(lines):
 s=line.strip()
 if not s or s=='---':continue
 if s.startswith('# '):
  text=s[2:]
  if i==0:
   story.append(Paragraph('PERFORMANCE APPRAISAL',styles['h1']))
   story.append(Paragraph('WORK SUMMARY',styles['h3']))
  else:
   if text=='Key Achievements':story.append(PageBreak())
   story.append(Paragraph(markup(text),styles['h1']))
 elif s.startswith('## '):story.append(Paragraph(markup(s[3:]),styles['h2']))
 elif s.startswith('### '):story.append(Paragraph(markup(s[4:]),styles['h3']))
 elif s.startswith('- '):story.append(Paragraph('• '+markup(s[2:]),styles['nested' if line.startswith('  ') else 'bullet']))
 elif i<7:story.append(Paragraph(markup(s),styles['meta']))
 elif re.fullmatch(r'\*\*[^*]+\*\*',s) and '+' not in s:story.append(Paragraph(markup(s),styles['label']))
 else:story.append(Paragraph(markup(s),styles['body']))
 # all source text for exhaustive verification
 expected.append(re.sub(r'\*\*','',normalize(re.sub(r'^#{1,3}\s*|^-\s*','',s))))

def decor(c,doc):
 w,h=doc.pagesize
 c.setFillColor(teal);c.rect(0,h-8,w,8,fill=1,stroke=0)
 c.setFillColor(muted);c.setFont('Bold',8);c.drawString(44,h-34,'PERFORMANCE APPRAISAL  /  JULY - OCTOBER 2026')
 c.setStrokeColor(HexColor('#DCE5EA'));c.line(44,48,w-44,48)
 c.setFont('Body',8);c.drawString(44,32,'Manivasagan A.  |  Full Stack Developer')
 c.drawRightString(w-44,32,f'{doc.page:02d}')

doc=SimpleDocTemplate(str(OUT),pagesize=(595.276,841.89),leftMargin=44,rightMargin=44,topMargin=61,bottomMargin=67,title='Performance Appraisal - Complete Work Summary',author='Manivasagan A.')
doc.build(story,onFirstPage=decor,onLaterPages=decor)
r=PdfReader(str(OUT));pdftext=' '.join(p.extract_text() for p in r.pages)
def flat(s):return re.sub(r'\s+','',s)
combined=flat(pdftext)
missing=[e for e in expected if flat(e) not in combined and not e.startswith('PERFORMANCE APPRAISAL')]
assert not missing,missing
print('Pages:',len(r.pages));print('Verified every source heading, paragraph and bullet:',len(expected));print(OUT)
