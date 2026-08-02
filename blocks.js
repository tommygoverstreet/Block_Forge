/* ============================================================
   BLOCK LIBRARY — All block definitions
============================================================ */
const BLOCK_LIBRARY = {
  "Layout": [
    { id:"hero",       icon:"🦸", label:"Hero" },
    { id:"two-col",    icon:"⬛", label:"2 Columns" },
    { id:"three-col",  icon:"▦",  label:"3 Columns" },
    { id:"four-col",   icon:"⊞",  label:"4 Columns" },
    { id:"section",    icon:"📦", label:"Section" },
    { id:"container",  icon:"🗃️", label:"Container" },
    { id:"divider",    icon:"➖", label:"Divider" },
    { id:"spacer",     icon:"↕️", label:"Spacer" },
  ],
  "Content": [
    { id:"heading",    icon:"H",  label:"Heading" },
    { id:"paragraph",  icon:"¶",  label:"Paragraph" },
    { id:"quote",      icon:"❝",  label:"Quote" },
    { id:"list",       icon:"📋", label:"List" },
    { id:"badge",      icon:"🏷️", label:"Badge" },
    { id:"code",       icon:"</>",label:"Code" },
    { id:"table",      icon:"📊", label:"Table" },
  ],
  "Media": [
    { id:"image",      icon:"🖼️", label:"Image" },
    { id:"video",      icon:"🎬", label:"Video" },
    { id:"icon-block", icon:"⭐", label:"Icon" },
    { id:"avatar",     icon:"👤", label:"Avatar" },
    { id:"gallery",    icon:"🖼️", label:"Gallery" },
    { id:"logo",       icon:"🔷", label:"Logo" },
  ],
  "UI Components": [
    { id:"button",     icon:"🔘", label:"Button" },
    { id:"card",       icon:"🃏", label:"Card" },
    { id:"feature",    icon:"✨", label:"Feature" },
    { id:"pricing",    icon:"💰", label:"Pricing" },
    { id:"testimonial",icon:"💬", label:"Testimonial" },
    { id:"stats",      icon:"📈", label:"Stats" },
    { id:"progress",   icon:"📊", label:"Progress" },
    { id:"accordion",  icon:"🪗", label:"Accordion" },
    { id:"tabs",       icon:"📑", label:"Tabs" },
    { id:"alert",      icon:"⚠️", label:"Alert" },
    { id:"badge-group",icon:"🏷️", label:"Badges" },
    { id:"timeline",   icon:"⏱️", label:"Timeline" },
  ],
  "Navigation": [
    { id:"navbar",     icon:"🧭", label:"Navbar" },
    { id:"footer",     icon:"🦶", label:"Footer" },
    { id:"breadcrumb", icon:"🍞", label:"Breadcrumb" },
    { id:"pagination", icon:"📄", label:"Pagination" },
  ],
  "Forms": [
    { id:"form",       icon:"📋", label:"Form" },
    { id:"newsletter", icon:"📧", label:"Newsletter" },
    { id:"search",     icon:"🔍", label:"Search" },
    { id:"input-field",icon:"✏️", label:"Input" },
  ],
  "Marketing": [
    { id:"cta",        icon:"📣", label:"CTA Banner" },
    { id:"banner",     icon:"🎯", label:"Ad Banner" },
    { id:"countdown",  icon:"⏰", label:"Countdown" },
    { id:"social",     icon:"🌐", label:"Social Links" },
  ],
};

/* ============================================================
   BLOCK RENDERERS
============================================================ */
const BLOCK_RENDERERS = {
  hero: (d) => `
    <div style="background:${d.bg||'linear-gradient(135deg,#6366f1,#ec4899)'};padding:${d.padding||'80px 40px'};text-align:${d.align||'center'}">
      ${d.eyebrow?`<p style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7);margin-bottom:16px">${d.eyebrow}</p>`:''}
      <h1 style="font-size:${d.titleSize||'52px'};font-weight:900;color:#fff;line-height:1.1;margin-bottom:20px;font-family:'Playfair Display',serif">${d.title||'Headline That Converts'}</h1>
      <p style="font-size:${d.subtitleSize||'18px'};color:rgba(255,255,255,.8);max-width:560px;margin:0 auto 32px;line-height:1.6">${d.subtitle||'A compelling subheadline that explains your value proposition clearly.'}</p>
      <div style="display:flex;gap:12px;justify-content:${d.align==='left'?'flex-start':d.align==='right'?'flex-end':'center'};flex-wrap:wrap">
        <a href="${d.btnLink||'#'}" style="display:inline-block;padding:14px 32px;background:#fff;color:#6366f1;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none">${d.btnText||'Get Started'}</a>
        ${d.showSecondBtn?`<a href="${d.btn2Link||'#'}" style="display:inline-block;padding:14px 32px;background:rgba(255,255,255,.15);color:#fff;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;border:2px solid rgba(255,255,255,.3)">${d.btn2Text||'Learn More'}</a>`:''}
      </div>
    </div>`,

  'two-col': (d) => `
    <div style="display:grid;grid-template-columns:${d.ratio||'1fr 1fr'};gap:${d.gap||'32px'};padding:${d.padding||'48px 40px'};background:${d.bg||'#fff'}">
      <div style="background:${d.col1bg||'#f8f9fa'};border-radius:12px;padding:24px;min-height:120px"><p style="color:#999;font-size:13px">Column 1</p></div>
      <div style="background:${d.col2bg||'#f8f9fa'};border-radius:12px;padding:24px;min-height:120px"><p style="color:#999;font-size:13px">Column 2</p></div>
    </div>`,

  'three-col': (d) => `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:${d.gap||'24px'};padding:${d.padding||'48px 40px'};background:${d.bg||'#fff'}">
      ${[1,2,3].map(i=>`<div style="background:#f8f9fa;border-radius:12px;padding:24px;min-height:100px"><p style="color:#999;font-size:13px">Column ${i}</p></div>`).join('')}
    </div>`,

  'four-col': (d) => `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:${d.gap||'20px'};padding:${d.padding||'48px 40px'};background:${d.bg||'#fff'}">
      ${[1,2,3,4].map(i=>`<div style="background:#f8f9fa;border-radius:12px;padding:20px;min-height:80px"><p style="color:#999;font-size:12px">Col ${i}</p></div>`).join('')}
    </div>`,

  section: (d) => `
    <div style="padding:${d.padding||'60px 40px'};background:${d.bg||'#fff'};text-align:${d.align||'left'}">
      ${d.label?`<p style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${d.accent||'#6366f1'};margin-bottom:12px">${d.label}</p>`:''}
      <h2 style="font-size:${d.titleSize||'36px'};font-weight:800;color:${d.titleColor||'#111'};margin-bottom:16px;line-height:1.2">${d.title||'Section Title'}</h2>
      <p style="font-size:16px;color:${d.textColor||'#555'};max-width:600px;${d.align==='center'?'margin:0 auto':''}line-height:1.7">${d.text||'Section description goes here.'}</p>
    </div>`,

  container: (d) => `
    <div style="max-width:${d.maxWidth||'1100px'};margin:0 auto;padding:${d.padding||'40px 24px'};background:${d.bg||'transparent'}">
      <p style="color:#bbb;font-size:13px;text-align:center;border:2px dashed #e5e7eb;padding:20px;border-radius:8px">Container — max-width: ${d.maxWidth||'1100px'}</p>
    </div>`,

  divider: (d) => `
    <div style="padding:${d.padding||'8px 40px'}">
      <hr style="border:none;border-top:${d.thickness||'1px'} ${d.style||'solid'} ${d.color||'#e5e7eb'}">
    </div>`,

  spacer: (d) => `<div style="height:${d.height||'40px'};background:transparent"></div>`,

  heading: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'}">
      <${d.tag||'h2'} style="font-size:${d.size||'32px'};font-weight:${d.weight||'800'};color:${d.color||'#111'};text-align:${d.align||'left'};line-height:1.2;font-family:${d.font==='serif'?'Playfair Display,serif':'Inter,sans-serif'}">${d.text||'Your Heading Here'}</${d.tag||'h2'}>
    </div>`,

  paragraph: (d) => `
    <div style="padding:${d.padding||'16px 40px'};background:${d.bg||'transparent'}">
      <p style="font-size:${d.size||'16px'};color:${d.color||'#444'};line-height:${d.lineHeight||'1.7'};text-align:${d.align||'left'};max-width:${d.maxWidth||'720px'}">${d.text||'Your paragraph text goes here. Write compelling copy that engages your audience.'}</p>
    </div>`,

  quote: (d) => `
    <div style="padding:${d.padding||'40px'};background:${d.bg||'#f8f9fa'}">
      <blockquote style="border-left:4px solid ${d.accent||'#6366f1'};padding-left:24px;margin:0">
        <p style="font-size:${d.size||'20px'};font-style:italic;color:${d.color||'#333'};line-height:1.6;margin-bottom:16px">"${d.text||'This is a powerful quote that resonates with your audience.'}"</p>
        ${d.author?`<cite style="font-size:14px;font-weight:700;color:${d.accent||'#6366f1'};font-style:normal">— ${d.author}${d.role?`, <span style="font-weight:400;color:#888">${d.role}</span>`:''}</cite>`:''}
      </blockquote>
    </div>`,

  list: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'}">
      <${d.ordered?'ol':'ul'} style="padding-left:${d.ordered?'20px':'0'};list-style:${d.ordered?'decimal':'none'};color:${d.color||'#333'};font-size:${d.size||'15px'}">
        ${(d.items||['First item','Second item','Third item','Fourth item']).map(item=>`<li style="padding:7px 0;${!d.ordered?'padding-left:26px;position:relative':''}">${!d.ordered?`<span style="position:absolute;left:0;color:${d.accent||'#6366f1'};font-weight:700">✓</span>`:''}${item}</li>`).join('')}
      </${d.ordered?'ol':'ul'}>
    </div>`,

  badge: (d) => `
    <div style="padding:${d.padding||'12px 40px'};background:${d.bg||'transparent'}">
      <span style="display:inline-block;padding:${d.size==='lg'?'8px 20px':'4px 12px'};background:${d.color||'rgba(99,102,241,.1)'};color:${d.textColor||'#6366f1'};border-radius:99px;font-size:${d.size==='lg'?'14px':'12px'};font-weight:700">${d.text||'New Feature'}</span>
    </div>`,

  code: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'}">
      <pre style="background:#1e1e2e;border-radius:10px;padding:20px;overflow-x:auto;margin:0"><code style="font-family:'JetBrains Mono',monospace;font-size:${d.size||'13px'};color:#a5b4fc;line-height:1.7">${(d.code||'const greeting = "Hello, World!";\nconsole.log(greeting);').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>
    </div>`,

  table: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'};overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:${d.headerBg||'#6366f1'}">
          ${(d.headers||['Name','Role','Status','Date']).map(h=>`<th style="padding:12px 16px;text-align:left;color:#fff;font-weight:600">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${(d.rows||[['Alice Johnson','Designer','Active','Jan 2025'],['Bob Smith','Developer','Active','Feb 2025'],['Carol White','Manager','Inactive','Mar 2025']]).map((row,i)=>`<tr style="background:${i%2===0?'#fff':'#f9fafb'};border-bottom:1px solid #e5e7eb">${row.map(cell=>`<td style="padding:12px 16px;color:#333">${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`,

  image: (d) => `
    <div style="padding:${d.padding||'0'};background:${d.bg||'transparent'};text-align:${d.align||'center'}">
      <img src="${d.src||'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80'}" alt="${d.alt||'Image'}" style="width:${d.width||'100%'};max-width:${d.maxWidth||'100%'};height:${d.height||'auto'};object-fit:${d.fit||'cover'};border-radius:${d.radius||'0px'}">
      ${d.caption?`<p style="font-size:12px;color:#888;margin-top:8px;text-align:center;padding:0 40px">${d.caption}</p>`:''}
    </div>`,

  video: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'#000'}">
      <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:${d.radius||'12px'};overflow:hidden">
        <iframe src="${d.src||'https://www.youtube.com/embed/dQw4w9WgXcQ'}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>
      </div>
    </div>`,

  'icon-block': (d) => `
    <div style="padding:${d.padding||'24px 40px'};text-align:${d.align||'center'}">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:${d.size||'64px'};height:${d.size||'64px'};background:${d.bg||'rgba(99,102,241,.1)'};border-radius:${d.radius||'16px'};font-size:${d.iconSize||'28px'}">${d.icon||'⭐'}</div>
      ${d.label?`<p style="margin-top:10px;font-size:13px;font-weight:600;color:#555">${d.label}</p>`:''}
    </div>`,

  avatar: (d) => `
    <div style="padding:${d.padding||'24px 40px'};display:flex;align-items:center;gap:16px;background:${d.bg||'transparent'}">
      <img src="${d.src||'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80'}" style="width:${d.size||'56px'};height:${d.size||'56px'};border-radius:50%;object-fit:cover;border:3px solid ${d.borderColor||'#6366f1'}">
      <div>
        <p style="font-weight:700;color:${d.nameColor||'#111'};font-size:15px">${d.name||'John Doe'}</p>
        <p style="color:${d.roleColor||'#888'};font-size:13px">${d.role||'Product Designer'}</p>
      </div>
    </div>`,

  gallery: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'#fff'}">
      <div style="display:grid;grid-template-columns:repeat(${d.cols||3},1fr);gap:${d.gap||'12px'}">
        ${(d.images||[
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80',
          'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
          'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&q=80',
          'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=400&q=80',
          'https://images.unsplash.com/photo-1547658719-da2b51169166?w=400&q=80',
          'https://images.unsplash.com/photo-1555421689-491a97ff2040?w=400&q=80',
        ]).map(src=>`<img src="${src}" style="width:100%;height:${d.imgHeight||'180px'};object-fit:cover;border-radius:${d.radius||'8px'}">`).join('')}
      </div>
    </div>`,

  logo: (d) => `
    <div style="padding:${d.padding||'20px 40px'};background:${d.bg||'transparent'};text-align:${d.align||'left'}">
      <div style="display:inline-flex;align-items:center;gap:10px">
        <div style="width:${d.size||'40px'};height:${d.size||'40px'};background:${d.iconBg||'linear-gradient(135deg,#6366f1,#ec4899)'};border-radius:${d.radius||'10px'};display:flex;align-items:center;justify-content:center;font-size:20px">${d.icon||'⚡'}</div>
        <span style="font-size:${d.fontSize||'20px'};font-weight:800;color:${d.color||'#111'};letter-spacing:-.5px">${d.name||'BrandName'}</span>
      </div>
    </div>`,

  button: (d) => `
    <div style="padding:${d.padding||'16px 40px'};background:${d.bg||'transparent'};text-align:${d.align||'left'}">
      <a href="${d.link||'#'}" style="display:inline-block;padding:${d.size==='lg'?'16px 40px':d.size==='sm'?'8px 20px':'12px 28px'};background:${d.variant==='outline'?'transparent':d.color||'#6366f1'};color:${d.variant==='outline'?d.color||'#6366f1':'#fff'};border-radius:${d.radius||'8px'};font-weight:700;font-size:${d.size==='lg'?'16px':d.size==='sm'?'13px':'14px'};text-decoration:none;border:2px solid ${d.color||'#6366f1'}">${d.icon?`${d.icon} `:''}${d.text||'Click Here'}</a>
    </div>`,

  card: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'#f8f9fa'}">
      <div style="background:#fff;border-radius:${d.radius||'16px'};padding:${d.innerPad||'28px'};box-shadow:0 4px 24px rgba(0,0,0,.08);border:1px solid #e5e7eb;max-width:${d.maxWidth||'400px'}">
        ${d.icon?`<div style="font-size:32px;margin-bottom:16px">${d.icon}</div>`:''}
        ${d.img?`<img src="${d.img}" style="width:100%;height:180px;object-fit:cover;border-radius:10px;margin-bottom:16px">`:''}
        <h3 style="font-size:${d.titleSize||'20px'};font-weight:800;color:#111;margin-bottom:10px">${d.title||'Card Title'}</h3>
        <p style="font-size:14px;color:#666;line-height:1.6;margin-bottom:20px">${d.text||'Card description that explains the content clearly.'}</p>
        ${d.showBtn!==false?`<a href="${d.link||'#'}" style="display:inline-block;padding:10px 24px;background:${d.btnColor||'#6366f1'};color:#fff;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none">${d.btnText||'Learn More'}</a>`:''}
      </div>
    </div>`,

  feature: (d) => `
    <div style="padding:${d.padding||'32px 40px'};background:${d.bg||'#fff'}">
      <div style="display:flex;gap:20px;align-items:flex-start;max-width:600px">
        <div style="width:52px;height:52px;background:${d.iconBg||'rgba(99,102,241,.1)'};border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${d.icon||'✨'}</div>
        <div>
          <h3 style="font-size:18px;font-weight:800;color:#111;margin-bottom:8px">${d.title||'Feature Title'}</h3>
          <p style="font-size:14px;color:#666;line-height:1.6">${d.text||'Describe this feature and how it benefits your users.'}</p>
        </div>
      </div>
    </div>`,

  pricing: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'#f8f9fa'}">
      <div style="background:${d.featured?'linear-gradient(135deg,#6366f1,#8b5cf6)':'#fff'};border-radius:20px;padding:32px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.1);border:${d.featured?'none':'1px solid #e5e7eb'}">
        ${d.badge?`<span style="display:inline-block;padding:4px 12px;background:rgba(255,255,255,.2);color:${d.featured?'#fff':'#6366f1'};border-radius:99px;font-size:11px;font-weight:700;margin-bottom:16px">${d.badge}</span>`:''}
        <h3 style="font-size:20px;font-weight:800;color:${d.featured?'#fff':'#111'};margin-bottom:8px">${d.plan||'Pro Plan'}</h3>
        <div style="margin-bottom:20px">
          <span style="font-size:48px;font-weight:900;color:${d.featured?'#fff':'#111'}">${d.price||'$49'}</span>
          <span style="font-size:14px;color:${d.featured?'rgba(255,255,255,.7)':'#888'}">/month</span>
        </div>
        <ul style="list-style:none;margin-bottom:28px;padding:0">
          ${(d.features||['Unlimited projects','Priority support','Advanced analytics','Custom domain']).map(f=>`<li style="padding:8px 0;color:${d.featured?'rgba(255,255,255,.9)':'#555'};font-size:14px;display:flex;align-items:center;gap:8px"><span style="color:${d.featured?'#a5b4fc':'#10b981'}">✓</span>${f}</li>`).join('')}
        </ul>
        <a href="${d.link||'#'}" style="display:block;text-align:center;padding:14px;background:${d.featured?'#fff':'#6366f1'};color:${d.featured?'#6366f1':'#fff'};border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">${d.btnText||'Get Started'}</a>
      </div>
    </div>`,

  testimonial: (d) => `
    <div style="padding:${d.padding||'32px 40px'};background:${d.bg||'#f8f9fa'}">
      <div style="background:#fff;border-radius:16px;padding:28px;max-width:480px;box-shadow:0 4px 20px rgba(0,0,0,.06);border:1px solid #e5e7eb">
        <div style="display:flex;gap:3px;margin-bottom:16px">${'⭐'.repeat(parseInt(d.stars)||5)}</div>
        <p style="font-size:${d.size||'16px'};color:#333;line-height:1.7;margin-bottom:20px;font-style:italic">"${d.text||'This product completely transformed how we work. The results exceeded our expectations.'}"</p>
        <div style="display:flex;align-items:center;gap:12px">
          <img src="${d.avatar||'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&q=80'}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">
          <div>
            <p style="font-weight:700;color:#111;font-size:14px">${d.name||'Sarah Johnson'}</p>
            <p style="color:#888;font-size:12px">${d.role||'CEO, TechCorp'}</p>
          </div>
        </div>
      </div>
    </div>`,

  stats: (d) => `
    <div style="padding:${d.padding||'48px 40px'};background:${d.bg||'#fff'}">
      <div style="display:grid;grid-template-columns:repeat(${d.cols||4},1fr);gap:24px;text-align:center">
        ${(d.items||[{val:'10K+',label:'Users'},{val:'99.9%',label:'Uptime'},{val:'$2M+',label:'Revenue'},{val:'4.9★',label:'Rating'}]).map(s=>`
          <div>
            <div style="font-size:${d.valSize||'40px'};font-weight:900;color:${d.valColor||'#6366f1'};line-height:1">${s.val}</div>
            <div style="font-size:13px;color:#888;margin-top:8px;font-weight:600">${s.label}</div>
          </div>`).join('')}
      </div>
    </div>`,

  progress: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'}">
      ${(d.items||[{label:'Design',val:90},{label:'Development',val:75},{label:'Marketing',val:60}]).map(item=>`
        <div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px;font-weight:600;color:#333">${item.label}</span>
            <span style="font-size:13px;font-weight:700;color:${d.color||'#6366f1'}">${item.val}%</span>
          </div>
          <div style="height:${d.height||'8px'};background:#e5e7eb;border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${item.val}%;background:${d.color||'linear-gradient(90deg,#6366f1,#8b5cf6)'};border-radius:99px"></div>
          </div>
        </div>`).join('')}
    </div>`,

  accordion: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'}">
      ${(d.items||[{q:'What is this product?',a:'A comprehensive solution for your needs.'},{q:'How does pricing work?',a:'Flexible monthly and annual plans available.'},{q:'Is there a free trial?',a:'Yes! 14 days free, no credit card required.'}]).map((item,i)=>`
        <div style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:8px;overflow:hidden">
          <div style="padding:16px 20px;background:${i===0?'#f8f9fa':'#fff'};display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;color:#111;font-size:14px">${item.q}</span>
            <span style="color:#6366f1;font-size:18px;font-weight:300">${i===0?'−':'+'}</span>
          </div>
          ${i===0?`<div style="padding:16px 20px;background:#fff;border-top:1px solid #e5e7eb"><p style="font-size:14px;color:#555;line-height:1.6">${item.a}</p></div>`:''}
        </div>`).join('')}
    </div>`,

  tabs: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'}">
      <div style="display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:20px">
        ${(d.tabs||['Overview','Features','Pricing','FAQ']).map((tab,i)=>`<button style="padding:10px 20px;border:none;background:none;font-weight:${i===0?'700':'500'};color:${i===0?'#6366f1':'#888'};font-size:14px;border-bottom:${i===0?'2px solid #6366f1':'2px solid transparent'};margin-bottom:-2px;cursor:pointer">${tab}</button>`).join('')}
      </div>
      <div style="font-size:14px;color:#555;line-height:1.7">${d.content||'Tab content goes here. Each tab can contain different sections.'}</div>
    </div>`,

  alert: (d) => `
    <div style="padding:${d.padding||'16px 40px'};background:${d.bg||'transparent'}">
      <div style="padding:14px 18px;background:${d.type==='success'?'rgba(16,185,129,.1)':d.type==='warning'?'rgba(245,158,11,.1)':d.type==='error'?'rgba(239,68,68,.1)':'rgba(99,102,241,.1)'};border-left:4px solid ${d.type==='success'?'#10b981':d.type==='warning'?'#f59e0b':d.type==='error'?'#ef4444':'#6366f1'};border-radius:8px;display:flex;align-items:flex-start;gap:12px">
        <span style="font-size:18px;flex-shrink:0">${d.type==='success'?'✅':d.type==='warning'?'⚠️':d.type==='error'?'❌':'ℹ️'}</span>
        <div>
          ${d.title?`<p style="font-weight:700;color:#111;font-size:14px;margin-bottom:4px">${d.title}</p>`:''}
          <p style="font-size:13px;color:#555;line-height:1.5">${d.text||'This is an informational alert message.'}</p>
        </div>
      </div>
    </div>`,

  'badge-group': (d) => `
    <div style="padding:${d.padding||'16px 40px'};background:${d.bg||'transparent'};display:flex;flex-wrap:wrap;gap:8px">
      ${(d.badges||['React','TypeScript','Node.js','GraphQL','AWS','Docker','Redis','PostgreSQL']).map(b=>`<span style="padding:6px 14px;background:${d.bg2||'rgba(99,102,241,.1)'};color:${d.color||'#6366f1'};border-radius:99px;font-size:12px;font-weight:700">${b}</span>`).join('')}
    </div>`,

  timeline: (d) => `
    <div style="padding:${d.padding||'32px 40px'};background:${d.bg||'transparent'}">
      ${(d.items||[{date:'Jan 2024',title:'Company Founded',text:'Started with a vision to change the industry.'},{date:'Jun 2024',title:'First Product Launch',text:'Released our flagship product to great reception.'},{date:'Dec 2024',title:'Series A Funding',text:'Raised $5M to accelerate growth.'}]).map((item,i,arr)=>`
        <div style="display:flex;gap:20px;margin-bottom:${i<arr.length-1?'28px':'0'}">
          <div style="display:flex;flex-direction:column;align-items:center">
            <div style="width:14px;height:14px;background:${d.color||'#6366f1'};border-radius:50%;flex-shrink:0;margin-top:4px"></div>
            ${i<arr.length-1?`<div style="width:2px;flex:1;background:#e5e7eb;margin-top:6px"></div>`:''}
          </div>
          <div>
            <span style="font-size:11px;font-weight:700;color:${d.color||'#6366f1'};text-transform:uppercase;letter-spacing:.05em">${item.date}</span>
            <h4 style="font-size:15px;font-weight:700;color:#111;margin:4px 0 6px">${item.title}</h4>
            <p style="font-size:13px;color:#666;line-height:1.5">${item.text}</p>
          </div>
        </div>`).join('')}
    </div>`,

  navbar: (d) => `
    <nav style="padding:0 40px;height:${d.height||'64px'};background:${d.bg||'#fff'};display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${d.border||'#e5e7eb'}">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;background:${d.logoBg||'linear-gradient(135deg,#6366f1,#ec4899)'};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">${d.logoIcon||'⚡'}</div>
        <span style="font-weight:800;font-size:16px;color:${d.logoColor||'#111'}">${d.brand||'BrandName'}</span>
      </div>
      <div style="display:flex;gap:28px">
        ${(d.links||['Home','About','Features','Pricing','Contact']).map(l=>`<a href="#" style="font-size:14px;font-weight:500;color:${d.linkColor||'#555'};text-decoration:none">${l}</a>`).join('')}
      </div>
      <a href="${d.ctaLink||'#'}" style="padding:9px 22px;background:${d.ctaBg||'#6366f1'};color:#fff;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none">${d.ctaText||'Get Started'}</a>
    </nav>`,

  footer: (d) => `
    <footer style="padding:${d.padding||'48px 40px 24px'};background:${d.bg||'#111'};color:${d.color||'#fff'}">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
            <div style="width:28px;height:28px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px">⚡</div>
            <span style="font-weight:800;font-size:15px">${d.brand||'BrandName'}</span>
          </div>
          <p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.7;max-width:240px">${d.desc||'Building the future, one block at a time.'}</p>
        </div>
        ${(d.cols||[{title:'Product',links:['Features','Pricing','Changelog']},{title:'Company',links:['About','Blog','Careers']},{title:'Legal',links:['Privacy','Terms','Cookies']}]).map(col=>`
          <div>
            <h4 style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:16px">${col.title}</h4>
            ${col.links.map(l=>`<a href="#" style="display:block;font-size:13px;color:rgba(255,255,255,.6);text-decoration:none;margin-bottom:10px">${l}</a>`).join('')}
          </div>`).join('')}
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.1);padding-top:20px;display:flex;justify-content:space-between;align-items:center">
        <p style="font-size:12px;color:rgba(255,255,255,.3)">© ${new Date().getFullYear()} ${d.brand||'BrandName'}. All rights reserved.</p>
        <div style="display:flex;gap:12px">
          ${(d.social||['𝕏','in','📘','📸']).map(s=>`<a href="#" style="font-size:16px;text-decoration:none">${s}</a>`).join('')}
        </div>
      </div>
    </footer>`,

  breadcrumb: (d) => `
    <div style="padding:${d.padding||'12px 40px'};background:${d.bg||'transparent'}">
      <nav style="display:flex;align-items:center;gap:8px;font-size:13px">
        ${(d.items||['Home','Products','Category','Current Page']).map((item,i,arr)=>`
          <a href="#" style="color:${i===arr.length-1?'#111':'#6366f1'};text-decoration:none;font-weight:${i===arr.length-1?'600':'400'}">${item}</a>
          ${i<arr.length-1?`<span style="color:#ccc">/</span>`:''}`).join('')}
      </nav>
    </div>`,

  pagination: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'};display:flex;justify-content:center">
      <div style="display:flex;gap:6px">
        ${['←',...Array.from({length:d.pages||5},(_,i)=>i+1),'→'].map((p,i)=>`
          <a href="#" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;background:${p===2?'#6366f1':'#f3f4f6'};color:${p===2?'#fff':'#555'}">${p}</a>`).join('')}
      </div>
    </div>`,

  form: (d) => `
    <div style="padding:${d.padding||'40px'};background:${d.bg||'#f8f9fa'}">
      <div style="background:#fff;border-radius:16px;padding:32px;max-width:480px;box-shadow:0 4px 20px rgba(0,0,0,.06)">
        <h3 style="font-size:22px;font-weight:800;color:#111;margin-bottom:8px">${d.title||'Contact Us'}</h3>
        <p style="font-size:13px;color:#888;margin-bottom:24px">${d.subtitle||"We'll get back to you within 24 hours."}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">First Name</label><input type="text" placeholder="John" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none"></div>
          <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">Last Name</label><input type="text" placeholder="Doe" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none"></div>
        </div>
        <div style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">Email</label><input type="email" placeholder="john@example.com" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none"></div>
        <div style="margin-bottom:20px"><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">Message</label><textarea placeholder="Your message…" rows="4" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;resize:vertical;font-family:inherit"></textarea></div>
        <button style="width:100%;padding:13px;background:${d.btnColor||'#6366f1'};color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer">${d.btnText||'Send Message'}</button>
      </div>
    </div>`,

  newsletter: (d) => `
    <div style="padding:${d.padding||'48px 40px'};background:${d.bg||'linear-gradient(135deg,#6366f1,#8b5cf6)'};text-align:center">
      <h2 style="font-size:${d.titleSize||'32px'};font-weight:900;color:#fff;margin-bottom:12px">${d.title||'Stay in the Loop'}</h2>
      <p style="font-size:15px;color:rgba(255,255,255,.8);margin-bottom:28px">${d.subtitle||'Get the latest updates delivered to your inbox.'}</p>
      <div style="display:flex;gap:10px;max-width:440px;margin:0 auto">
        <input type="email" placeholder="${d.placeholder||'Enter your email…'}" style="flex:1;padding:13px 16px;border:none;border-radius:8px;font-size:14px;outline:none">
        <button style="padding:13px 24px;background:#fff;color:#6366f1;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap">${d.btnText||'Subscribe'}</button>
      </div>
      ${d.note?`<p style="font-size:11px;color:rgba(255,255,255,.5);margin-top:12px">${d.note}</p>`:'<p style="font-size:11px;color:rgba(255,255,255,.5);margin-top:12px">No spam, unsubscribe anytime.</p>'}
    </div>`,

  search: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'}">
      <div style="position:relative;max-width:${d.maxWidth||'480px'}">
        <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px">🔍</span>
        <input type="search" placeholder="${d.placeholder||'Search…'}" style="width:100%;padding:13px 16px 13px 44px;border:2px solid ${d.borderColor||'#e5e7eb'};border-radius:${d.radius||'10px'};font-size:14px;outline:none;background:#fff">
      </div>
    </div>`,

  'input-field': (d) => `
    <div style="padding:${d.padding||'16px 40px'};background:${d.bg||'transparent'}">
      ${d.label?`<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px">${d.label}</label>`:''}
      <input type="${d.type||'text'}" placeholder="${d.placeholder||'Enter value…'}" style="width:100%;max-width:${d.maxWidth||'400px'};padding:11px 14px;border:1px solid ${d.borderColor||'#e5e7eb'};border-radius:${d.radius||'8px'};font-size:14px;outline:none;background:#fff">
      ${d.hint?`<p style="font-size:11px;color:#888;margin-top:5px">${d.hint}</p>`:''}
    </div>`,

  cta: (d) => `
    <div style="padding:${d.padding||'60px 40px'};background:${d.bg||'#111'};text-align:center">
      ${d.eyebrow?`<p style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${d.accent||'#a5b4fc'};margin-bottom:16px">${d.eyebrow}</p>`:''}
      <h2 style="font-size:${d.titleSize||'40px'};font-weight:900;color:#fff;margin-bottom:16px;line-height:1.2">${d.title||'Ready to Get Started?'}</h2>
      <p style="font-size:16px;color:rgba(255,255,255,.6);max-width:480px;margin:0 auto 32px;line-height:1.6">${d.text||'Join thousands of teams already using our platform.'}</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <a href="${d.btnLink||'#'}" style="padding:15px 36px;background:${d.btnColor||'#6366f1'};color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">${d.btnText||'Start Free Trial'}</a>
        ${d.showSecond?`<a href="${d.btn2Link||'#'}" style="padding:15px 36px;background:rgba(255,255,255,.1);color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;border:1px solid rgba(255,255,255,.2)">${d.btn2Text||'Learn More'}</a>`:''}
      </div>
    </div>`,

  banner: (d) => `
    <div style="padding:${d.padding||'20px 40px'};background:${d.bg||'linear-gradient(90deg,#f59e0b,#ef4444)'};display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:12px">
        ${d.icon?`<span style="font-size:24px">${d.icon}</span>`:'<span style="font-size:24px">🔥</span>'}
        <div>
          ${d.title?`<p style="font-weight:800;color:#fff;font-size:15px">${d.title}</p>`:''}
          <p style="font-size:13px;color:rgba(255,255,255,.9)">${d.text||"Limited time offer — Don't miss out!"}</p>
        </div>
      </div>
      <a href="${d.link||'#'}" style="padding:9px 22px;background:#fff;color:#ef4444;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap">${d.btnText||'Claim Now'}</a>
    </div>`,

  countdown: (d) => `
    <div style="padding:${d.padding||'40px'};background:${d.bg||'#111'};text-align:center">
      ${d.title?`<h3 style="font-size:20px;font-weight:800;color:#fff;margin-bottom:24px">${d.title}</h3>`:'<h3 style="font-size:20px;font-weight:800;color:#fff;margin-bottom:24px">Offer Expires In</h3>'}
      <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
        ${[{val:'02',label:'Days'},{val:'14',label:'Hours'},{val:'37',label:'Minutes'},{val:'52',label:'Seconds'}].map(t=>`
          <div style="background:rgba(255,255,255,.1);border-radius:12px;padding:16px 20px;min-width:72px">
            <div style="font-size:36px;font-weight:900;color:#fff;font-family:monospace">${t.val}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);font-weight:600;margin-top:4px">${t.label}</div>
          </div>`).join('')}
      </div>
    </div>`,

  social: (d) => `
    <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'transparent'};display:flex;gap:12px;flex-wrap:wrap;justify-content:${d.align||'flex-start'}">
      ${(d.links||[{icon:'𝕏',label:'Twitter',color:'#000'},{icon:'in',label:'LinkedIn',color:'#0077b5'},{icon:'f',label:'Facebook',color:'#1877f2'},{icon:'📸',label:'Instagram',color:'#e1306c'}]).map(s=>`
        <a href="#" style="width:44px;height:44px;background:${d.style==='colored'?s.color:'#f3f4f6'};border-radius:${d.radius||'10px'};display:flex;align-items:center;justify-content:center;font-size:18px;text-decoration:none;color:${d.style==='colored'?'#fff':'#555'}" title="${s.label}">${s.icon}</a>`).join('')}
    </div>`,
};

/* ============================================================
   PROPERTY SCHEMAS
============================================================ */
const PROP_SCHEMAS = {
  hero: [
    { section:'Content' },
    { key:'eyebrow', label:'Eyebrow Text', type:'text' },
    { key:'title', label:'Headline', type:'text' },
    { key:'subtitle', label:'Subheadline', type:'textarea' },
    { key:'btnText', label:'Button Label', type:'text' },
    { key:'btnLink', label:'Button URL', type:'text' },
    { key:'showSecondBtn', label:'2nd Button', type:'toggle' },
    { key:'btn2Text', label:'Button 2 Label', type:'text' },
    { key:'btn2Link', label:'Button 2 URL', type:'text' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'gradient' },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right'] },
    { key:'padding', label:'Padding', type:'text' },
    { key:'titleSize', label:'Title Size', type:'text' },
    { key:'subtitleSize', label:'Subtitle Size', type:'text' },
  ],
  heading: [
    { section:'Content' },
    { key:'text', label:'Text', type:'text' },
    { key:'tag', label:'HTML Tag', type:'select', options:['h1','h2','h3','h4','h5','h6'] },
    { section:'Style' },
    { key:'size', label:'Font Size', type:'text' },
    { key:'weight', label:'Font Weight', type:'select', options:['400','500','600','700','800','900'] },
    { key:'color', label:'Color', type:'color' },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right'] },
    { key:'font', label:'Font Family', type:'select', options:['sans','serif'] },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  paragraph: [
    { section:'Content' },
    { key:'text', label:'Text', type:'textarea' },
    { section:'Style' },
    { key:'size', label:'Font Size', type:'text' },
    { key:'color', label:'Color', type:'color' },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right','justify'] },
    { key:'lineHeight', label:'Line Height', type:'text' },
    { key:'maxWidth', label:'Max Width', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  button: [
    { section:'Content' },
    { key:'text', label:'Label', type:'text' },
    { key:'link', label:'URL', type:'text' },
    { key:'icon', label:'Icon (emoji)', type:'text' },
    { section:'Style' },
    { key:'color', label:'Color', type:'color' },
    { key:'variant', label:'Variant', type:'select', options:['solid','outline'] },
    { key:'size', label:'Size', type:'select', options:['sm','md','lg'] },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right'] },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  card: [
    { section:'Content' },
    { key:'title', label:'Title', type:'text' },
    { key:'text', label:'Description', type:'textarea' },
    { key:'icon', label:'Icon (emoji)', type:'text' },
    { key:'img', label:'Image URL', type:'text' },
    { key:'btnText', label:'Button Text', type:'text' },
    { key:'link', label:'Button URL', type:'text' },
    { key:'showBtn', label:'Show Button', type:'toggle' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'btnColor', label:'Button Color', type:'color' },
    { key:'radius', label:'Card Radius', type:'text' },
    { key:'maxWidth', label:'Max Width', type:'text' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  image: [
    { section:'Content' },
    { key:'src', label:'Image URL', type:'text' },
    { key:'alt', label:'Alt Text', type:'text' },
    { key:'caption', label:'Caption', type:'text' },
    { section:'Style' },
    { key:'width', label:'Width', type:'text' },
    { key:'height', label:'Height', type:'text' },
    { key:'maxWidth', label:'Max Width', type:'text' },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'fit', label:'Object Fit', type:'select', options:['cover','contain','fill','none'] },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right'] },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  stats: [
    { section:'Content' },
    { key:'cols', label:'Columns', type:'select', options:['2','3','4'] },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'valColor', label:'Value Color', type:'color' },
    { key:'valSize', label:'Value Size', type:'text' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  alert: [
    { section:'Content' },
    { key:'title', label:'Title', type:'text' },
    { key:'text', label:'Message', type:'textarea' },
    { section:'Style' },
    { key:'type', label:'Type', type:'select', options:['info','success','warning','error'] },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  navbar: [
    { section:'Content' },
    { key:'brand', label:'Brand Name', type:'text' },
    { key:'logoIcon', label:'Logo Icon', type:'text' },
    { key:'ctaText', label:'CTA Text', type:'text' },
    { key:'ctaLink', label:'CTA URL', type:'text' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'ctaBg', label:'CTA Color', type:'color' },
    { key:'logoColor', label:'Logo Text Color', type:'color' },
    { key:'linkColor', label:'Link Color', type:'color' },
    { key:'height', label:'Height', type:'text' },
  ],
  footer: [
    { section:'Content' },
    { key:'brand', label:'Brand Name', type:'text' },
    { key:'desc', label:'Description', type:'textarea' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  newsletter: [
    { section:'Content' },
    { key:'title', label:'Title', type:'text' },
    { key:'subtitle', label:'Subtitle', type:'text' },
    { key:'placeholder', label:'Placeholder', type:'text' },
    { key:'btnText', label:'Button Text', type:'text' },
    { key:'note', label:'Note Text', type:'text' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'gradient' },
    { key:'titleSize', label:'Title Size', type:'text' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  cta: [
    { section:'Content' },
    { key:'eyebrow', label:'Eyebrow', type:'text' },
    { key:'title', label:'Title', type:'text' },
    { key:'text', label:'Description', type:'textarea' },
    { key:'btnText', label:'Button Text', type:'text' },
    { key:'btnLink', label:'Button URL', type:'text' },
    { key:'showSecond', label:'2nd Button', type:'toggle' },
    { key:'btn2Text', label:'Button 2 Text', type:'text' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'btnColor', label:'Button Color', type:'color' },
    { key:'accent', label:'Accent Color', type:'color' },
    { key:'titleSize', label:'Title Size', type:'text' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  testimonial: [
    { section:'Content' },
    { key:'text', label:'Quote', type:'textarea' },
    { key:'name', label:'Name', type:'text' },
    { key:'role', label:'Role / Company', type:'text' },
    { key:'avatar', label:'Avatar URL', type:'text' },
    { key:'stars', label:'Stars', type:'select', options:['1','2','3','4','5'] },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'size', label:'Quote Size', type:'text' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  pricing: [
    { section:'Content' },
    { key:'plan', label:'Plan Name', type:'text' },
    { key:'price', label:'Price', type:'text' },
    { key:'badge', label:'Badge Label', type:'text' },
    { key:'btnText', label:'Button Text', type:'text' },
    { key:'link', label:'Button URL', type:'text' },
    { section:'Style' },
    { key:'featured', label:'Featured Style', type:'toggle' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  feature: [
    { section:'Content' },
    { key:'icon', label:'Icon (emoji)', type:'text' },
    { key:'title', label:'Title', type:'text' },
    { key:'text', label:'Description', type:'textarea' },
    { section:'Style' },
    { key:'iconBg', label:'Icon Background', type:'color' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  quote: [
    { section:'Content' },
    { key:'text', label:'Quote Text', type:'textarea' },
    { key:'author', label:'Author', type:'text' },
    { key:'role', label:'Role', type:'text' },
    { section:'Style' },
    { key:'accent', label:'Accent Color', type:'color' },
    { key:'color', label:'Text Color', type:'color' },
    { key:'bg', label:'Background', type:'color' },
    { key:'size', label:'Font Size', type:'text' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  banner: [
    { section:'Content' },
    { key:'icon', label:'Icon (emoji)', type:'text' },
    { key:'title', label:'Title', type:'text' },
    { key:'text', label:'Message', type:'text' },
    { key:'btnText', label:'Button Text', type:'text' },
    { key:'link', label:'Button URL', type:'text' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'gradient' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  section: [
    { section:'Content' },
    { key:'label', label:'Eyebrow Label', type:'text' },
    { key:'title', label:'Title', type:'text' },
    { key:'text', label:'Description', type:'textarea' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'titleColor', label:'Title Color', type:'color' },
    { key:'textColor', label:'Text Color', type:'color' },
    { key:'accent', label:'Accent Color', type:'color' },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right'] },
    { key:'titleSize', label:'Title Size', type:'text' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  divider: [
    { section:'Style' },
    { key:'color', label:'Color', type:'color' },
    { key:'thickness', label:'Thickness', type:'text' },
    { key:'style', label:'Style', type:'select', options:['solid','dashed','dotted'] },
    { key:'padding', label:'Padding', type:'text' },
  ],
  spacer: [
    { section:'Style' },
    { key:'height', label:'Height', type:'text' },
  ],
  progress: [
    { section:'Style' },
    { key:'color', label:'Bar Color', type:'color' },
    { key:'height', label:'Bar Height', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  'badge-group': [
    { section:'Style' },
    { key:'color', label:'Text Color', type:'color' },
    { key:'bg2', label:'Badge Background', type:'color' },
    { key:'bg', label:'Section Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  social: [
    { section:'Style' },
    { key:'style', label:'Style', type:'select', options:['default','colored'] },
    { key:'align', label:'Alignment', type:'select', options:['flex-start','center','flex-end'] },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  countdown: [
    { section:'Content' },
    { key:'title', label:'Title', type:'text' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  logo: [
    { section:'Content' },
    { key:'name', label:'Brand Name', type:'text' },
    { key:'icon', label:'Icon (emoji)', type:'text' },
    { section:'Style' },
    { key:'iconBg', label:'Icon Background', type:'gradient' },
    { key:'color', label:'Text Color', type:'color' },
    { key:'fontSize', label:'Font Size', type:'text' },
    { key:'size', label:'Icon Size', type:'text' },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right'] },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  avatar: [
    { section:'Content' },
    { key:'src', label:'Image URL', type:'text' },
    { key:'name', label:'Name', type:'text' },
    { key:'role', label:'Role', type:'text' },
    { section:'Style' },
    { key:'size', label:'Avatar Size', type:'text' },
    { key:'borderColor', label:'Border Color', type:'color' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  'icon-block': [
    { section:'Content' },
    { key:'icon', label:'Icon (emoji)', type:'text' },
    { key:'label', label:'Label', type:'text' },
    { section:'Style' },
    { key:'size', label:'Box Size', type:'text' },
    { key:'iconSize', label:'Icon Size', type:'text' },
    { key:'bg', label:'Icon Background', type:'color' },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'align', label:'Alignment', type:'select', options:['left','center','right'] },
    { key:'padding', label:'Padding', type:'text' },
  ],
  form: [
    { section:'Content' },
    { key:'title', label:'Form Title', type:'text' },
    { key:'subtitle', label:'Subtitle', type:'text' },
    { key:'btnText', label:'Submit Button', type:'text' },
    { section:'Style' },
    { key:'btnColor', label:'Button Color', type:'color' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  search: [
    { section:'Content' },
    { key:'placeholder', label:'Placeholder', type:'text' },
    { section:'Style' },
    { key:'borderColor', label:'Border Color', type:'color' },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'maxWidth', label:'Max Width', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  'input-field': [
    { section:'Content' },
    { key:'label', label:'Label', type:'text' },
    { key:'placeholder', label:'Placeholder', type:'text' },
    { key:'type', label:'Input Type', type:'select', options:['text','email','password','number','tel','url'] },
    { key:'hint', label:'Hint Text', type:'text' },
    { section:'Style' },
    { key:'borderColor', label:'Border Color', type:'color' },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'maxWidth', label:'Max Width', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  code: [
    { section:'Content' },
    { key:'code',    label:'Code',     type:'textarea' },
    { section:'Style' },
    { key:'size',    label:'Font Size', type:'text' },
    { key:'bg',      label:'Background',type:'color' },
    { key:'padding', label:'Padding',   type:'text' },
  ],
  table: [
    { section:'Style' },
    { key:'headerBg', label:'Header Color', type:'color' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  list: [
    { section:'Content' },
    { key:'ordered', label:'Numbered List', type:'toggle' },
    { section:'Style' },
    { key:'color', label:'Text Color', type:'color' },
    { key:'accent', label:'Check Color', type:'color' },
    { key:'size', label:'Font Size', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  badge: [
    { section:'Content' },
    { key:'text', label:'Badge Text', type:'text' },
    { section:'Style' },
    { key:'color', label:'Background', type:'color' },
    { key:'textColor', label:'Text Color', type:'color' },
    { key:'size', label:'Size', type:'select', options:['sm','lg'] },
    { key:'bg', label:'Section Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  accordion: [
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  tabs: [
    { section:'Content' },
    { key:'content', label:'Tab Content', type:'textarea' },
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  timeline: [
    { section:'Style' },
    { key:'color', label:'Accent Color', type:'color' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  breadcrumb: [
    { section:'Style' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  pagination: [
    { section:'Style' },
    { key:'pages', label:'Page Count', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  gallery: [
    { section:'Style' },
    { key:'cols', label:'Columns', type:'select', options:['2','3','4'] },
    { key:'gap', label:'Gap', type:'text' },
    { key:'imgHeight', label:'Image Height', type:'text' },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  video: [
    { section:'Content' },
    { key:'src', label:'Embed URL', type:'text' },
    { section:'Style' },
    { key:'radius', label:'Border Radius', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  'two-col': [
    { section:'Style' },
    { key:'ratio', label:'Column Ratio', type:'select', options:['1fr 1fr','2fr 1fr','1fr 2fr','3fr 1fr','1fr 3fr'] },
    { key:'gap', label:'Gap', type:'text' },
    { key:'col1bg', label:'Col 1 Background', type:'color' },
    { key:'col2bg', label:'Col 2 Background', type:'color' },
    { key:'bg', label:'Section Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  'three-col': [
    { section:'Style' },
    { key:'gap', label:'Gap', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  'four-col': [
    { section:'Style' },
    { key:'gap', label:'Gap', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
  container: [
    { section:'Style' },
    { key:'maxWidth', label:'Max Width', type:'text' },
    { key:'bg', label:'Background', type:'color' },
    { key:'padding', label:'Padding', type:'text' },
  ],
};

/* ============================================================
   TEMPLATES
============================================================ */
const TEMPLATES = [
  {
    id:'landing', name:'Landing Page', icon:'🚀', desc:'Full marketing landing page',
    color:'linear-gradient(135deg,#6366f1,#8b5cf6)',
    blocks:[
      {type:'navbar', data:{brand:'StartupCo',ctaText:'Get Started'}},
      {type:'hero', data:{eyebrow:'Introducing v2.0',title:'Build Faster Than Ever',subtitle:'The all-in-one platform for modern teams. Ship products your users will love.',btnText:'Start Free Trial',showSecondBtn:true,btn2Text:'Watch Demo'}},
      {type:'stats', data:{bg:'#f8f9fa'}},
      {type:'section', data:{label:'Features',title:'Everything You Need',text:'Powerful tools designed for modern workflows and ambitious teams.',align:'center',bg:'#fff'}},
      {type:'feature', data:{icon:'⚡',title:'Lightning Fast',text:'Optimized for performance at every level of the stack.'}},
      {type:'feature', data:{icon:'🔒',title:'Enterprise Security',text:'Bank-grade encryption and compliance built in from day one.'}},
      {type:'feature', data:{icon:'📊',title:'Advanced Analytics',text:'Real-time insights that help you make better decisions faster.'}},
      {type:'testimonial', data:{}},
      {type:'pricing', data:{plan:'Pro',price:'$49',badge:'Most Popular',featured:true}},
      {type:'cta', data:{title:'Start Building Today',text:'Join 10,000+ teams already using our platform.',btnText:'Start Free Trial'}},
      {type:'footer', data:{brand:'StartupCo'}},
    ]
  },
  {
    id:'email', name:'Email Newsletter', icon:'📧', desc:'Professional email template',
    color:'linear-gradient(135deg,#06b6d4,#3b82f6)',
    blocks:[
      {type:'logo', data:{name:'Newsletter',align:'center',bg:'#f8f9fa',padding:'24px 40px'}},
      {type:'hero', data:{title:'This Week in Tech',subtitle:'Your curated digest of the most important stories.',bg:'linear-gradient(135deg,#06b6d4,#3b82f6)',btnText:'Read Full Issue',titleSize:'36px'}},
      {type:'section', data:{title:'Top Story',text:'The biggest news this week and what it means for you and your team.',bg:'#fff'}},
      {type:'divider', data:{}},
      {type:'stats', data:{items:[{val:'12',label:'Articles'},{val:'5min',label:'Read Time'},{val:'8K+',label:'Readers'},{val:'Weekly',label:'Cadence'}],bg:'#f8f9fa'}},
      {type:'newsletter', data:{title:'Share with Friends',subtitle:"Know someone who'd love this?",btnText:'Forward Email',bg:'linear-gradient(135deg,#06b6d4,#3b82f6)'}},
    ]
  },
  {
    id:'flyer', name:'Event Flyer', icon:'🎉', desc:'Event promotion flyer',
    color:'linear-gradient(135deg,#ec4899,#f59e0b)',
    blocks:[
      {type:'hero', data:{eyebrow:"You're Invited",title:'Annual Tech Summit 2026',subtitle:'Join 500+ innovators for a day of talks, workshops, and networking.',bg:'linear-gradient(135deg,#ec4899,#f59e0b)',btnText:'Register Now',titleSize:'44px'}},
      {type:'stats', data:{items:[{val:'500+',label:'Attendees'},{val:'20+',label:'Speakers'},{val:'8h',label:'Content'},{val:'Free',label:'Entry'}],bg:'#fff'}},
      {type:'timeline', data:{items:[{date:'9:00 AM',title:'Doors Open',text:'Registration and networking breakfast.'},{date:'10:00 AM',title:'Keynote',text:'Opening keynote by industry leaders.'},{date:'2:00 PM',title:'Workshops',text:'Hands-on sessions across 4 tracks.'}]}},
      {type:'cta', data:{title:'Reserve Your Spot',text:'Limited seats available. Register before they are gone.',btnText:'Get Free Ticket'}},
    ]
  },
  {
    id:'ad', name:'Display Ad', icon:'📢', desc:'Banner advertisement',
    color:'linear-gradient(135deg,#f59e0b,#ef4444)',
    blocks:[
      {type:'banner', data:{icon:'🔥',title:'Flash Sale — 50% Off',text:'Today only. Use code SAVE50 at checkout.',btnText:'Shop Now',bg:'linear-gradient(90deg,#f59e0b,#ef4444)'}},
      {type:'hero', data:{title:"Don't Miss Out",subtitle:'Biggest sale of the year ends tonight.',bg:'#111',btnText:'Claim Deal',titleSize:'36px'}},
      {type:'countdown', data:{title:'Offer Expires In',bg:'#1a1a2e'}},
    ]
  },
  {
    id:'portfolio', name:'Portfolio', icon:'🎨', desc:'Creative portfolio showcase',
    color:'linear-gradient(135deg,#10b981,#06b6d4)',
    blocks:[
      {type:'navbar', data:{brand:'Portfolio',ctaText:'Hire Me',ctaBg:'#10b981'}},
      {type:'hero', data:{eyebrow:'Creative Designer',title:'Crafting Digital Experiences',subtitle:'I design beautiful, functional products that people love to use.',bg:'linear-gradient(135deg,#10b981,#06b6d4)',btnText:'View Work',showSecondBtn:true,btn2Text:'Contact Me'}},
      {type:'gallery', data:{cols:3}},
      {type:'stats', data:{items:[{val:'5+',label:'Years Exp.'},{val:'120+',label:'Projects'},{val:'98%',label:'Satisfaction'},{val:'40+',label:'Clients'}]}},
      {type:'testimonial', data:{}},
      {type:'footer', data:{brand:'Portfolio',bg:'#0f172a'}},
    ]
  },
  {
    id:'saas', name:'SaaS Pricing', icon:'💰', desc:'Pricing page with tiers',
    color:'linear-gradient(135deg,#8b5cf6,#6366f1)',
    blocks:[
      {type:'section', data:{label:'Pricing',title:'Simple, Transparent Pricing',text:'No hidden fees. Cancel anytime. Start free.',align:'center',bg:'#f8f9fa'}},
      {type:'pricing', data:{plan:'Starter',price:'$0',badge:'Free Forever',features:['5 projects','1GB storage','Email support','Basic analytics'],bg:'#f8f9fa'}},
      {type:'pricing', data:{plan:'Pro',price:'$29',badge:'Most Popular',featured:true,features:['Unlimited projects','50GB storage','Priority support','Custom domain','Advanced analytics']}},
      {type:'pricing', data:{plan:'Enterprise',price:'$99',badge:'For Teams',features:['Everything in Pro','SSO / SAML','SLA guarantee','Dedicated manager','Custom contracts'],bg:'#f8f9fa'}},
      {type:'testimonial', data:{}},
      {type:'cta', data:{title:'Start Your Free Trial',text:'14 days free. No credit card required.',btnText:'Get Started Free'}},
    ]
  },
];

/* ============================================================
   THEMES
============================================================ */
const THEMES = [
  { id:'indigo',  name:'Indigo',   primary:'#6366f1', preview:'linear-gradient(135deg,#6366f1,#8b5cf6)' },
  { id:'rose',    name:'Rose',     primary:'#f43f5e', preview:'linear-gradient(135deg,#f43f5e,#ec4899)' },
  { id:'emerald', name:'Emerald',  primary:'#10b981', preview:'linear-gradient(135deg,#10b981,#06b6d4)' },
  { id:'amber',   name:'Amber',    primary:'#f59e0b', preview:'linear-gradient(135deg,#f59e0b,#ef4444)' },
  { id:'sky',     name:'Sky Blue', primary:'#0ea5e9', preview:'linear-gradient(135deg,#0ea5e9,#6366f1)' },
  { id:'slate',   name:'Slate',    primary:'#475569', preview:'linear-gradient(135deg,#475569,#1e293b)' },
];