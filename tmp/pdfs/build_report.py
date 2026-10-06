from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
from pathlib import Path

ROOT=Path('/Users/lakoffice/Documents/gaming hub')
OUT=ROOT/'output/pdf/Manivasagan_A_Performance_Appraisal_Jul_Oct_2026.pdf'
for n,f in [('Body','Arial.ttf'),('Bold','Arial Bold.ttf')]:
 pdfmetrics.registerFont(TTFont(n,'/System/Library/Fonts/Supplemental/'+f))
W,H=595.276,841.89
NAVY=HexColor('#142B42'); TEAL=HexColor('#007F83'); INK=HexColor('#26384A'); MUTED=HexColor('#647789'); PALE=HexColor('#EFF5F7'); GOLD=HexColor('#E4B765')
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('Performance Appraisal | Manivasagan A. | July - October 2026')
c.setAuthor('Manivasagan A.')
c.setSubject('Work summary for performance appraisal meeting')
styles={
 'body':ParagraphStyle('body',fontName='Body',fontSize=10.3,leading=15,textColor=INK),
 'small':ParagraphStyle('small',fontName='Body',fontSize=9,leading=13,textColor=MUTED),
 'white':ParagraphStyle('white',fontName='Body',fontSize=12,leading=18,textColor=white),
 'card':ParagraphStyle('card',fontName='Bold',fontSize=12,leading=17,textColor=NAVY),
}
y=0

def p(text,style='body',x=44,width=507,gap=9):
 global y
 ob=Paragraph(text,styles[style]); ww,hh=ob.wrap(width,700)
 if y-hh<60: raise RuntimeError('Content overflow: '+text[:70])
 ob.drawOn(c,x,y-hh); y-=hh+gap

def section(title):
 global y
 y-=6;c.setFillColor(TEAL);c.setFont('Bold',12);c.drawString(44,y-13,title);y-=26

def bullets(items):
 for t in items:p('• '+t,gap=6)

def box(title,text):
 global y
 ob=Paragraph(text,styles['body']);_,hh=ob.wrap(475,700)
 total=hh+52
 if y-total<60:raise RuntimeError('box overflow')
 c.setFillColor(PALE);c.roundRect(44,y-total,507,total,9,fill=1,stroke=0)
 c.setFillColor(TEAL);c.setFont('Bold',10);c.drawString(60,y-22,title.upper())
 ob.drawOn(c,60,y-37-hh);y-=total+16

def page(num,kicker,title,subtitle):
 global y
 c.setFillColor(TEAL);c.rect(0,H-9,W,9,fill=1,stroke=0)
 c.setFillColor(MUTED);c.setFont('Bold',8);c.drawString(44,H-39,'PERFORMANCE APPRAISAL  /  JULY - OCTOBER 2026')
 c.setFillColor(TEAL);c.setFont('Bold',9);c.drawString(44,H-76,kicker.upper())
 c.setFillColor(NAVY);c.setFont('Bold',25);c.drawString(44,H-108,title)
 y=H-125;p(subtitle,'small',gap=20)
 c.setStrokeColor(HexColor('#DCE5EA'));c.line(44,48,W-44,48)
 c.setFillColor(MUTED);c.setFont('Body',8);c.drawString(44,32,'Manivasagan A.  |  Full Stack Developer')
 c.drawRightString(W-44,32,f'{num:02d} / 08')

def end():c.showPage()

# 1: executive opening
page(1,'Work summary','Building connected applications','Lords and Kings Enterprises Pvt. Ltd.')
c.setFillColor(NAVY);c.roundRect(44,y-132,507,132,10,fill=1,stroke=0)
c.setFillColor(GOLD);c.setFont('Bold',9);c.drawString(62,y-26,'EMPLOYEE  /  APPRAISAL PERIOD')
c.setFillColor(white);c.setFont('Bold',26);c.drawString(62,y-64,'Manivasagan A.')
c.setFont('Body',12);c.drawString(62,y-90,'Full Stack Developer');c.drawString(62,y-112,'July 2026 - October 2026')
y-=153
section('Overall contribution')
p('During this period, I contributed to web, mobile, gaming, financial and internal business applications. My work covered frontend and backend development, database integration, multiplayer functionality, payments, security testing, deployment and production support.')
section('Key achievements')
bullets([
'<b>Connected three major platforms:</b> Gaming Hub, Coupon Platform and Lottery Platform through API-based integration.',
'<b>Completed the Tournament System:</b> supported game compatibility, wallet/redeemed-coin flows and match time limits.',
'<b>Expanded application access:</b> Attendance on web, Android and Windows; Gaming Hub as an Android APK; iOS conversion work.',
'<b>Strengthened core systems:</b> contributed to multiplayer gameplay, wallet operations, KYC, verification and payment integrations.',
'<b>Supported delivery and reliability:</b> resolved reported bugs and hosting issues, with security testing and retesting.'
])
box('Growth in ownership','My responsibilities expanded from individual web application tasks to complete modules spanning development, integration, testing, security, deployment and maintenance.')
end()
# 2
page(2,'01 / Gaming Hub','Multiplayer & game experience','A major project during the appraisal period: web and mobile gameplay, wallets, tournaments and administration.')
section('Multiplayer systems')
p('Worked on multiplayer implementation for <b>Chess, Ludo, Snake and Ladder, Carrom, Snakes/Worms, Cricket, Table Tennis and Snooker</b>.')
bullets([
'<b>Match coordination:</b> multiplayer synchronization, room management, matchmaking, player interaction and turn management.',
'<b>Reliable match starts:</b> ready-check system, synchronized countdown and server-authoritative match start.',
'<b>Match continuity:</b> reconnect handling, lifecycle management and 10-minute automatic match termination.',
'<b>Cross-device validation:</b> multiplayer testing across mobile and desktop.'
])
section('Game-specific contributions')
bullets([
'<b>Carrom:</b> implemented multiplayer support, fixed striker issues and improved the UI and gameplay.',
'<b>Cricket:</b> developed gameplay; worked on batting/bowling roles, innings management and multiplayer synchronization; improved animations and fixed bugs.',
'<b>Snooker:</b> added the game, modified gameplay to requirements, added an attack/power level bar and refined it through testing.',
'<b>Table Tennis:</b> redesigned and modernized the UI.'
])
section('UI & mobile improvements')
p('Redesigned the Gaming Hub interface, added mobile-responsive layouts and bottom navigation, improved sidebar behavior and wallet UI, and introduced smooth animations and game-card effects. Optimized games for different mobile screen sizes and converted Gaming Hub into an <b>Android APK</b>.')
end()
# 3
page(3,'02 / Gaming Hub','Tournaments, wallet & KYC','Tournament operations and financial workflows within the Gaming Hub.')
section('Tournament Management System')
p('Designed and implemented tournament creation and management, player participation, entry-fee collection, prize distribution, refunds and settlement tracking.')
bullets([
'<b>Operations:</b> tournament scheduler, match time limits, notifications and email alerts.',
'<b>Tier configurations:</b> Mini, Basic, Standard, Premium and Pro.'
])
section('Admin analytics & monitoring')
p('Implemented or worked on analytics covering tournament activity, financial performance, entry fees, prizes, refunds, settlements, player participation, player performance, win rates and game-specific results.')
p('Also worked on tier performance trends, tournament health monitoring, stuck-tournament detection, scheduler monitoring and notification analytics for <b>Email, In-App and Socket.IO</b>.')
box('Reported result','Completed the Tournament System and maintained compatibility with supported games, wallet/redeemed-coin operations and match time-limit functionality.')
section('Wallet & identity verification')
p('Implemented or designed deposit and withdrawal interfaces, wallet summary, transaction history, coupon redemption, real-time balance handling and withdrawal verification.')
p('Worked on KYC workflows, document verification, admin approvals, Email OTP and authenticator-based verification. Focused on <b>transaction security, audit logs, concurrency protection and safe wallet operations</b>.')
end()
# 4
page(4,'03 / Coupon Platform','Coupon Vault & payments','An independent financial and coupon-management application integrated with the wider platform ecosystem.')
section('Coupon & customer workflows')
bullets([
'Designed a secure coupon redemption flow and implemented wallet funding through coupon redemption.',
'Worked on coupon verification and validation, transaction history and audit tracking.',
'Worked on referral functionality and added customer support and ticket management.'
])
section('Verification & payment integrations')
p('Implemented two-step verification using an <b>Authenticator App and Email OTP</b>, added withdrawal Email OTP verification and fixed email delivery issues.')
p('Worked on <b>PayPal, Razorpay and Stripe</b> integrations. Resolved PayPal integration and wallet-crediting issues.')
section('International currency support')
bullets([
'Implemented country-based currency handling and worked on local currency management.',
'Developed country-specific withdrawal and banking structures.',
'Planned currency conversion for international users.'
])
section('Platform integration')
p('Connected the Coupon Platform with Gaming Hub and the Lottery Platform. Verified that the platforms could communicate and operate together through APIs without direct database sharing.')
box('Integration approach','Gaming Hub ↔ Coupon Platform ↔ Lottery Platform<br/><br/>Independent applications connected through API-based workflows.')
end()
# 5
page(5,'04 / MegaDraw','Lottery administration','Architecture, administration, integration, deployment and production-readiness contributions.')
section('Administration modules')
p('Worked on or designed the following administration areas:')
bullets([
'<b>Business operations:</b> Reports & Financial Analytics, User Management, KYC Management and Affiliate Management.',
'<b>Game operations:</b> Games Management and Draw Management.',
'<b>Financial operations:</b> Wallet & Deposits and Withdrawals.',
'<b>Platform administration:</b> CMS & Banner Management, Audit Logs, Support Center, System Settings and Roles & Permissions.'
])
section('Enterprise access-control concepts')
p('Worked on planning and implementing advanced access-control concepts, including:')
bullets([
'<b>Role administration:</b> permission matrix, role templates, user-role assignment, role cloning and comparison.',
'<b>Governance:</b> temporary permissions, approval workflows and permission history.',
'<b>Access safeguards:</b> session management, IP/device restrictions and emergency access.',
'<b>Configuration & validation:</b> feature flags and user access simulation.'
])
section('Architecture & deployment')
p('Worked with a <b>React + Fastify + PostgreSQL/Supabase</b> architecture. Reviewed Docker-based deployment and Redis requirements, and evaluated PostgreSQL migration to Supabase Cloud.')
p('Re-hosted the Lottery Platform, resolved hosting and deployment issues, and integrated it with the Coupon Platform through APIs.')
end()
# 6
page(6,'05 / Internal applications','Attendance & team operations','Development, maintenance and HR-driven improvements to company applications.')
section('Attendance Management Application')
p('Analyzed requirements and developed <b>Admin and Employee modules</b>. Implemented database connectivity and employee ID management, and added office leave information to the database.')
p('Fixed attendance bugs and date/time spoofing issues, worked on location-spoofing protection, and added application version control. Performed repeated testing and debugging.')
box('Reported result','Delivered an attendance solution across web, Android and Windows, including an Android application and a Windows EXE for HR use, with improved security and reliability.')
section('Existing system & security application maintenance')
p('Tested and worked on issues involving automatic logout, Monthly Duty Report downloads, dark-theme visibility, sign-out confirmation, approved leave dates, time display and monthly calendar attendance status.')
p('Also worked on Guard and Location search filters, missing guard In-Time photos, login, email delivery, KYC verification and two-factor authentication. Implemented fixes and retested applications as part of regular security and vulnerability testing.')
section('Manpower Solutions & hiring')
p('Developed the Manpower Solutions page and revised its UI based on HR requirements. Aligned its design with the main Lords and Kings website, improved consistency between company websites and worked on responsive layouts.')
p('Started development of the Employee Hiring Application and made modifications based on requirements provided by Ashok Sir.')
end()
# 7
page(7,'06 / Delivery & reliability','Security, deployment & support','Ongoing work to improve application stability, validation and production operation.')
section('Security & vulnerability testing')
bullets([
'<b>Authentication:</b> login security, two-factor authentication, authenticator/TOTP and Email OTP.',
'<b>Financial & identity workflows:</b> withdrawal verification, KYC security and transaction validation.',
'<b>Application protection:</b> API security, location-spoofing prevention and date/time manipulation prevention.',
'<b>Validation cycle:</b> repeated vulnerability assessments, application security testing, fix verification and retesting.'
])
section('Deployment & production support')
p('Hosted Gaming Hub and resolved hosting issues. Re-hosted the Lottery and Coupon Platforms, connected all three applications and tested their simultaneous operation.')
p('Worked with Docker-based architecture, PostgreSQL and Supabase Cloud migration planning, and reviewed Redis requirements for scalable multiplayer architecture.')
section('Android, Windows & iOS')
p('Converted Attendance for Android and Windows EXE, converted Gaming Hub into an Android APK and tested mobile functionality. Configured and installed a macOS environment, resolved installation problems, converted the application for iOS and began iOS-related development.')
section('Bug fixing & team support')
p('Handled issues reported by Hari, Harish, Harishneelan, Saiyed and other team members. Examples included login, email, KYC, referrals, affiliate programs, navigation/back-button behavior, Carrom striker problems, Cricket, multiplayer synchronization, hosting and wallet/payment issues.')
p('Analyzed root causes, implemented fixes, tested changes and continued security validation after modifications.')
end()
# 8
page(8,'07 / Professional growth','Skills & future ownership','Technical experience developed through work across the application lifecycle.')
section('Technologies & skills used')
rows=[
('Frontend','React, TypeScript, JavaScript, Vite, responsive web development'),
('Backend','Node.js, Fastify, REST APIs, Socket.IO'),
('Database','PostgreSQL, Supabase, Prisma'),
('Real-time / scaling','Socket.IO, Redis, multiplayer architecture'),
('Deployment','Docker, Render, Supabase Cloud, production hosting'),
('Mobile','Capacitor, Android APK, iOS application conversion'),
('Payments','PayPal, Razorpay, Stripe'),
('Security','2FA, TOTP, Email OTP, KYC, API security, vulnerability testing'),
('Delivery practices','Git/GitHub, responsive UI, integration, debugging, architecture')]
for i,(a,b) in enumerate(rows):
 ob=Paragraph(b,styles['body']);_,hh=ob.wrap(344,100);rh=max(39,hh+16)
 if i%2==0:c.setFillColor(PALE);c.rect(44,y-rh,507,rh,fill=1,stroke=0)
 c.setFillColor(NAVY);c.setFont('Bold',9.4);c.drawString(54,y-20,a)
 ob.drawOn(c,197,y-8-hh);y-=rh
 y-=2
section('Growth during the appraisal period')
p('My experience expanded across full-stack development, multiplayer systems, payment integrations, mobile application conversion, security and production deployment. I took responsibility for development, integration, testing, deployment and maintenance across multiple projects.')
section('Priorities going forward')
bullets([
'Take greater ownership of complete modules and production systems.',
'Further improve system architecture, reliability and security.',
'Contribute at a higher level to upcoming company software projects.'
])
end();c.save();print(OUT)
