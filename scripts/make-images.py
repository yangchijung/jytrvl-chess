# Generates PNG icons and the Open Graph image (run once; outputs are committed).
from PIL import Image, ImageDraw, ImageFont
NAVY=(27,42,65); GOLD=(200,162,74); PAPER=(250,247,240); GREEN=(31,77,58); RED=(179,38,30)
serif='/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
def icon(size, path):
    im=Image.new('RGB',(size,size),NAVY); d=ImageDraw.Draw(im)
    m=size*0.16; d.ellipse([m,m,size-m,size-m],fill=PAPER,outline=GOLD,width=max(2,size//40))
    f=ImageFont.truetype(serif, int(size*0.3), index=1)
    d.text((size/2,size/2),'JY',fill=NAVY,font=f,anchor='mm'); im.save(path)
icon(180,'public/apple-touch-icon.png'); icon(192,'public/icon-192.png'); icon(512,'public/icon-512.png')
W,H=1200,630
im=Image.new('RGB',(W,H),NAVY); d=ImageDraw.Draw(im)
for i in range(H):
    t=i/H; c=tuple(int(NAVY[k]*(1-t)+GREEN[k]*t) for k in range(3)); d.line([(0,i),(W,i)],fill=c)
d.ellipse([820,-120,1320,380],outline=GOLD,width=22)
ft=ImageFont.truetype(serif,96,index=1); fs=ImageFont.truetype(serif,44,index=1)
d.text((80,170),'JY Chess',fill=PAPER,font=ft)
d.text((84,300),'西洋棋・中國象棋・台灣暗棋',fill=GOLD,font=fs)
d.text((84,370),'Chess · Xiangqi · Banqi',fill=PAPER,font=fs)
for i,(ch,col) in enumerate([('帥',RED),('車',(28,28,28)),('炮',RED)]):
    x=820+i*120; y=470
    d.ellipse([x-52,y-52,x+52,y+52],fill=(240,220,175),outline=(139,94,52),width=5)
    d.text((x,y),ch,fill=col,font=ImageFont.truetype(serif,60,index=1),anchor='mm')
im.save('public/og-image.png')
print('ok')
