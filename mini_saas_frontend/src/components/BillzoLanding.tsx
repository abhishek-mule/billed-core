<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>BillZo – Sahi Bill. Safe Deal.</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: #0e0e10;
    --ink-soft: #3d3d45;
    --ink-muted: #7a7a8c;
    --surface: #faf9f7;
    --surface-2: #f2f0ec;
    --surface-3: #e8e4dc;
    --indigo: #4338ca;
    --indigo-bright: #5548f0;
    --indigo-deep: #1e1657;
    --indigo-pale: #eeedfb;
    --emerald: #059669;
    --emerald-pale: #d1fae5;
    --amber: #d97706;
    --amber-pale: #fef3c7;
    --gold: #c5a55a;
    --radius-sm: 8px;
    --radius-md: 14px;
    --radius-lg: 22px;
    --radius-xl: 32px;
    --font-display: 'Instrument Serif', Georgia, serif;
    --font-body: 'DM Sans', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
    --shadow-card: 0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-float: 0 12px 40px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
  }

  html { scroll-behavior: smooth; }
  body {
    font-family: var(--font-body);
    background: var(--surface);
    color: var(--ink);
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    cursor: none;
  }

  /* Custom cursor */
  #cursor {
    width: 10px; height: 10px;
    background: var(--indigo-bright);
    border-radius: 50%;
    position: fixed;
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
    transition: width 0.2s, height 0.2s, background 0.2s;
  }
  #cursor-trail {
    width: 36px; height: 36px;
    border: 1.5px solid rgba(83,72,240,0.3);
    border-radius: 50%;
    position: fixed;
    pointer-events: none;
    z-index: 9998;
    transform: translate(-50%, -50%);
    transition: transform 0.12s ease-out, width 0.3s, height 0.3s, opacity 0.3s;
  }
  body:has(a:hover) #cursor, body:has(button:hover) #cursor { width: 20px; height: 20px; background: var(--gold); }
  body:has(a:hover) #cursor-trail, body:has(button:hover) #cursor-trail { width: 56px; height: 56px; opacity: 0.5; }

  /* Noise texture overlay */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 1000;
    opacity: 0.4;
  }

  /* ── NAV ─────────────────────────────────────── */
  nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 500;
    padding: 18px 48px;
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(250,249,247,0.8);
    backdrop-filter: blur(24px) saturate(1.5);
    border-bottom: 1px solid rgba(0,0,0,0.06);
    transition: padding 0.3s;
  }
  .nav-logo {
    display: flex; align-items: center; gap: 12px;
    text-decoration: none;
  }
  .nav-logo-mark {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, var(--indigo-bright), var(--indigo-deep));
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-display);
    font-size: 18px; color: white;
    font-style: italic;
    box-shadow: 0 4px 12px rgba(83,72,240,0.35);
  }
  .nav-wordmark { display: flex; flex-direction: column; line-height: 1; }
  .nav-wordmark span:first-child { font-family: var(--font-body); font-size: 16px; font-weight: 600; color: var(--ink); letter-spacing: -0.5px; }
  .nav-wordmark span:last-child { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--indigo); margin-top: 2px; font-weight: 500; }
  .nav-links { display: flex; gap: 36px; list-style: none; }
  .nav-links a { font-size: 14px; font-weight: 400; color: var(--ink-soft); text-decoration: none; transition: color 0.2s; position: relative; }
  .nav-links a::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 1px; background: var(--indigo); transform: scaleX(0); transform-origin: right; transition: transform 0.3s; }
  .nav-links a:hover { color: var(--ink); }
  .nav-links a:hover::after { transform: scaleX(1); transform-origin: left; }
  .nav-cta { display: flex; gap: 10px; align-items: center; }
  .btn-ghost { padding: 9px 20px; font-family: var(--font-body); font-size: 13px; font-weight: 500; color: var(--ink-soft); background: transparent; border: 1.5px solid var(--surface-3); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s; text-decoration: none; }
  .btn-ghost:hover { border-color: var(--indigo); color: var(--indigo); background: var(--indigo-pale); }
  .btn-primary { padding: 9px 22px; font-family: var(--font-body); font-size: 13px; font-weight: 600; color: white; background: var(--indigo-bright); border: none; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.25s; text-decoration: none; position: relative; overflow: hidden; }
  .btn-primary::before { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(255,255,255,0.15), transparent); }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(83,72,240,0.4); }
  .btn-primary:active { transform: translateY(0); }

  /* ── HERO ────────────────────────────────────── */
  .hero {
    min-height: 100vh;
    padding: 140px 48px 100px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 80px;
    align-items: center;
    max-width: 1280px;
    margin: 0 auto;
    position: relative;
  }
  .hero-bg-orb {
    position: absolute;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(83,72,240,0.08) 0%, transparent 70%);
    border-radius: 50%;
    top: 50%; right: -100px;
    transform: translateY(-50%);
    pointer-events: none;
  }
  .hero-bg-orb-2 {
    position: absolute;
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(197,165,90,0.07) 0%, transparent 70%);
    border-radius: 50%;
    top: 20%; left: -80px;
    pointer-events: none;
  }
  .hero-pill {
    display: inline-flex; align-items: center; gap: 8px;
    background: white;
    border: 1px solid rgba(83,72,240,0.2);
    border-radius: 100px;
    padding: 7px 16px;
    font-size: 12px; font-weight: 500;
    color: var(--indigo);
    margin-bottom: 28px;
    box-shadow: 0 2px 8px rgba(83,72,240,0.1);
    animation: fadeSlideUp 0.6s ease both;
  }
  .hero-pill-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; animation: pulse-dot 2s ease infinite; }
  @keyframes pulse-dot { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); } 50% { box-shadow: 0 0 0 5px rgba(16,185,129,0); } }

  .hero-h1 {
    font-family: var(--font-display);
    font-size: clamp(52px, 6vw, 80px);
    line-height: 1.08;
    letter-spacing: -1.5px;
    margin-bottom: 6px;
    animation: fadeSlideUp 0.7s 0.1s ease both;
  }
  .hero-h1 em { font-style: italic; color: var(--indigo-bright); }
  .hero-h1 .underline-word { position: relative; display: inline-block; }
  .hero-h1 .underline-word::after {
    content: '';
    position: absolute;
    bottom: 4px; left: 0; right: 0;
    height: 3px;
    background: var(--gold);
    border-radius: 2px;
    animation: drawLine 1s 0.8s ease both;
    transform-origin: left;
  }
  @keyframes drawLine { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  .hero-tagline { font-family: var(--font-display); font-style: italic; font-size: 20px; color: var(--indigo); margin-bottom: 24px; font-weight: 400; animation: fadeSlideUp 0.7s 0.15s ease both; }
  .hero-body { font-size: 17px; line-height: 1.7; color: var(--ink-soft); max-width: 480px; margin-bottom: 40px; font-weight: 300; animation: fadeSlideUp 0.7s 0.2s ease both; }
  .hero-actions { display: flex; gap: 14px; align-items: center; animation: fadeSlideUp 0.7s 0.25s ease both; }
  .btn-hero { padding: 14px 32px; font-family: var(--font-body); font-size: 15px; font-weight: 600; background: var(--indigo-bright); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; transition: all 0.3s; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 6px 20px rgba(83,72,240,0.35); position: relative; overflow: hidden; }
  .btn-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(255,255,255,0.15), transparent); }
  .btn-hero:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(83,72,240,0.45); }
  .btn-demo { padding: 14px 28px; font-family: var(--font-body); font-size: 15px; font-weight: 500; background: white; color: var(--ink-soft); border: 1.5px solid var(--surface-3); border-radius: var(--radius-md); cursor: pointer; transition: all 0.3s; display: inline-flex; align-items: center; gap: 10px; }
  .btn-demo:hover { border-color: var(--ink-soft); color: var(--ink); transform: translateY(-1px); box-shadow: var(--shadow-card); }
  .demo-icon { width: 24px; height: 24px; background: var(--ink); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .demo-icon::before { content: ''; border-left: 8px solid white; border-top: 5px solid transparent; border-bottom: 5px solid transparent; margin-left: 2px; }

  /* Trust bar */
  .hero-trust { margin-top: 52px; display: flex; align-items: center; gap: 28px; animation: fadeSlideUp 0.7s 0.3s ease both; }
  .trust-avatars { display: flex; }
  .trust-avatar { width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; background: var(--indigo-pale); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: var(--indigo); margin-left: -8px; }
  .trust-avatar:first-child { margin-left: 0; }
  .trust-text { font-size: 13px; color: var(--ink-muted); }
  .trust-text strong { color: var(--ink); font-weight: 600; }

  @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }

  /* ── HERO VISUAL ─────────────────────────────── */
  .hero-visual { position: relative; animation: fadeSlideIn 0.9s 0.35s ease both; }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: translateX(0); } }

  .mockup-browser {
    background: white;
    border-radius: var(--radius-lg);
    box-shadow: 0 32px 80px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08);
    overflow: hidden;
    transform: perspective(1200px) rotateY(-4deg) rotateX(2deg);
    transition: transform 0.5s ease;
  }
  .mockup-browser:hover { transform: perspective(1200px) rotateY(-1deg) rotateX(0deg); }

  .browser-chrome {
    background: #1a1025;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .browser-dots { display: flex; gap: 6px; }
  .browser-dot { width: 10px; height: 10px; border-radius: 50%; }
  .browser-dot.red { background: #ff5f57; }
  .browser-dot.yellow { background: #febc2e; }
  .browser-dot.green { background: #28c840; }
  .browser-url { flex: 1; background: rgba(255,255,255,0.08); border-radius: 6px; padding: 5px 12px; font-family: var(--font-mono); font-size: 11px; color: rgba(255,255,255,0.4); }

  .browser-body { padding: 24px; background: #f5f3ef; }
  .dashboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .dash-logo { font-family: var(--font-body); font-weight: 700; font-size: 16px; color: var(--indigo-deep); letter-spacing: -0.5px; }
  .dash-badge { background: linear-gradient(135deg, #10b981, #059669); color: white; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 100px; letter-spacing: 0.02em; }

  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .stat-card {
    background: white;
    border-radius: var(--radius-md);
    padding: 14px;
    border: 1px solid rgba(0,0,0,0.06);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-card); }
  .stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin-bottom: 6px; }
  .stat-val { font-size: 22px; font-weight: 700; color: var(--indigo-deep); letter-spacing: -0.5px; font-family: var(--font-body); }
  .stat-delta { font-size: 11px; font-weight: 600; margin-top: 3px; }
  .delta-up { color: #10b981; }
  .delta-warn { color: var(--amber); }

  .gstin-chip {
    background: linear-gradient(135deg, var(--indigo-deep), #2d1f6e);
    border-radius: var(--radius-md);
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
    overflow: hidden;
  }
  .gstin-chip::before {
    content: '';
    position: absolute;
    top: -30px; right: -30px;
    width: 120px; height: 120px;
    background: rgba(255,255,255,0.04);
    border-radius: 50%;
  }
  .gstin-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.1); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .gstin-info { flex: 1; }
  .gstin-sub { font-size: 10px; color: rgba(255,255,255,0.45); font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
  .gstin-num { font-family: var(--font-mono); font-size: 13px; color: white; font-weight: 500; letter-spacing: 0.04em; }
  .verified-pill { background: rgba(16,185,129,0.2); border: 1px solid rgba(16,185,129,0.3); color: #34d399; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 100px; letter-spacing: 0.04em; flex-shrink: 0; }

  /* Floating cards */
  .float-card {
    position: absolute;
    background: white;
    border-radius: var(--radius-md);
    padding: 12px 16px;
    box-shadow: var(--shadow-float);
    border: 1px solid rgba(0,0,0,0.07);
    animation: floatCard 4s ease-in-out infinite;
  }
  .float-card-1 { top: -20px; right: -36px; min-width: 160px; animation-delay: 0s; }
  .float-card-2 { bottom: -20px; left: -36px; animation-delay: 1.5s; }
  @keyframes floatCard { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
  .fc-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin-bottom: 4px; }
  .fc-val { font-size: 14px; font-weight: 700; color: var(--indigo-deep); font-family: var(--font-body); }
  .fc-active { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; font-size: 11px; font-weight: 600; color: #10b981; }
  .fc-active::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pulse-dot 2s infinite; }

  .float-card-2 .fc-row { display: flex; align-items: center; gap: 10px; }
  .fc-icon {
    width: 28px;
    height: 28px;
    border-radius: 10px;
    background: var(--indigo-pale);
    color: var(--indigo-deep);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .fc-icon svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
  .fc-text-sm { font-size: 12px; font-weight: 700; color: var(--ink); }
  .fc-sub-sm { font-size: 11px; color: var(--ink-muted); }

  /* ── MARQUEE STRIP ───────────────────────────── */
  .marquee-strip {
    background: var(--indigo-deep);
    padding: 16px 0;
    overflow: hidden;
    display: flex;
    gap: 0;
    position: relative;
  }
  .marquee-track {
    display: flex;
    gap: 0;
    animation: marquee 25s linear infinite;
    white-space: nowrap;
    flex-shrink: 0;
  }
  @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .marquee-item {
    display: flex; align-items: center; gap: 14px;
    padding: 0 40px;
    border-right: 1px solid rgba(255,255,255,0.08);
  }
  .marquee-item span:first-child { font-size: 20px; }
  .marquee-item span:last-child { font-size: 13px; color: rgba(255,255,255,0.6); white-space: nowrap; }
  .marquee-item strong { color: white; }
  .icon-badge {
    width: 22px;
    height: 22px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.9);
    flex-shrink: 0;
  }
  .icon-badge svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }

  /* ── FEATURES ────────────────────────────────── */
  .section { padding: 120px 48px; max-width: 1280px; margin: 0 auto; }

  .section-eyebrow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--indigo); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
  .section-eyebrow::before { content: ''; width: 28px; height: 1.5px; background: var(--indigo); }
  .section-h2 { font-family: var(--font-display); font-size: clamp(38px, 4.5vw, 58px); line-height: 1.1; letter-spacing: -1px; color: var(--ink); margin-bottom: 16px; }
  .section-h2 em { font-style: italic; color: var(--indigo-bright); }
  .section-sub { font-size: 17px; color: var(--ink-soft); font-weight: 300; max-width: 520px; line-height: 1.6; }

  .features-layout { display: grid; grid-template-columns: 1fr 1.1fr; gap: 80px; align-items: start; }

  .feature-tabs { display: flex; flex-direction: column; gap: 4px; margin-top: 48px; }
  .feature-tab {
    padding: 20px 24px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.25s;
    border: 1.5px solid transparent;
    position: relative;
    overflow: hidden;
  }
  .feature-tab::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--indigo-bright);
    border-radius: 3px;
    transform: scaleY(0);
    transition: transform 0.3s;
  }
  .feature-tab.active { background: white; border-color: rgba(83,72,240,0.15); box-shadow: var(--shadow-card); }
  .feature-tab.active::before { transform: scaleY(1); }
  .feature-tab:hover:not(.active) { background: rgba(255,255,255,0.6); }
  .tab-num { font-family: var(--font-mono); font-size: 11px; color: var(--ink-muted); margin-bottom: 6px; letter-spacing: 0.05em; }
  .tab-title { font-weight: 600; font-size: 15px; color: var(--ink); margin-bottom: 4px; }
  .tab-desc { font-size: 13px; color: var(--ink-muted); line-height: 1.6; font-weight: 300; }

  .feature-preview {
    position: sticky;
    top: 120px;
    background: white;
    border-radius: var(--radius-xl);
    box-shadow: 0 24px 64px rgba(0,0,0,0.1), 0 4px 16px rgba(0,0,0,0.06);
    overflow: hidden;
    border: 1px solid rgba(0,0,0,0.06);
    min-height: 380px;
  }
  .preview-chrome {
    background: #1a1025;
    padding: 12px 16px;
    display: flex; align-items: center; gap: 8px;
  }
  .preview-dots { display: flex; gap: 5px; }
  .preview-dots span { width: 8px; height: 8px; border-radius: 50%; }
  .preview-content { padding: 32px; }
  .preview-panel { display: none; }
  .preview-panel.active { display: block; animation: panelIn 0.35s ease; }
  @keyframes panelIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  /* Invoice preview */
  .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--surface-3); }
  .inv-brand { font-family: var(--font-display); font-size: 22px; color: var(--indigo-deep); font-style: italic; }
  .inv-meta { text-align: right; }
  .inv-meta .num { font-family: var(--font-mono); font-size: 12px; color: var(--ink-muted); }
  .inv-meta .date { font-size: 12px; color: var(--ink-muted); margin-top: 2px; }
  .inv-row-head { display: grid; grid-template-columns: 1fr auto auto auto; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--surface-2); margin-bottom: 8px; }
  .inv-row-head span { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-muted); }
  .inv-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--surface-2); }
  .inv-row span { font-size: 13px; color: var(--ink); }
  .inv-row span:last-child { font-weight: 600; }
  .tax-row { display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
  .tax-chip { background: var(--emerald-pale); color: #065f46; font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 100px; }
  .inv-total { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 2px solid var(--surface-3); }
  .inv-total-label { font-size: 13px; color: var(--ink-muted); }
  .inv-total-amt { font-family: var(--font-body); font-size: 28px; font-weight: 700; color: var(--indigo-deep); letter-spacing: -0.5px; }
  .send-btns { display: flex; gap: 10px; margin-top: 20px; }
  .send-btn { padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; border: none; }
  .btn-icon {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .btn-icon svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .send-wa { background: #25d366; color: white; }
  .send-wa:hover { background: #1dba57; transform: translateY(-1px); }
  .send-email { background: var(--indigo-pale); color: var(--indigo); }
  .send-email:hover { background: var(--indigo-bright); color: white; transform: translateY(-1px); }

  /* GSTIN verify */
  .gstin-verify-wrap { }
  .verify-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin-bottom: 10px; }
  .verify-input-row { display: flex; gap: 10px; margin-bottom: 20px; }
  .verify-input { flex: 1; font-family: var(--font-mono); font-size: 14px; font-weight: 500; color: var(--ink); background: var(--surface-2); border: 1.5px solid var(--surface-3); border-radius: var(--radius-sm); padding: 12px 16px; letter-spacing: 0.06em; outline: none; transition: border-color 0.2s; }
  .verify-input:focus { border-color: var(--indigo); background: white; }
  .verify-btn { padding: 12px 22px; background: var(--indigo-bright); color: white; border: none; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
  .verify-btn:hover { background: var(--indigo); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(83,72,240,0.3); }
  .verify-result {
    background: var(--surface-2);
    border-radius: var(--radius-md);
    padding: 20px;
    display: none;
    animation: panelIn 0.35s ease;
  }
  .verify-result.show { display: block; }
  .vr-status { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
  .vr-badge { background: var(--emerald-pale); color: #065f46; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 100px; }
  .vr-name { font-size: 17px; font-weight: 700; color: var(--indigo-deep); }
  .vr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .vr-item .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin-bottom: 3px; }
  .vr-item .val { font-size: 13px; font-weight: 600; color: var(--ink); }
  .val-active { color: var(--emerald); }

  /* Aadhaar */
  .aadhaar-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .aadhaar-flag { background: linear-gradient(135deg, #ff9933, white 40%, white 60%, #138808); border-radius: 6px; width: 48px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #000080; border: 1px solid rgba(0,0,0,0.1); }
  .aadhaar-title { font-size: 16px; font-weight: 700; color: var(--ink); }
  .aadhaar-sub { font-size: 12px; color: var(--ink-muted); }
  .aadh-field { margin-bottom: 18px; }
  .aadh-field-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin-bottom: 8px; }
  .aadh-input { width: 100%; font-family: var(--font-mono); font-size: 16px; font-weight: 500; letter-spacing: 0.12em; color: var(--ink); background: var(--surface-2); border: 1.5px solid var(--surface-3); border-radius: var(--radius-sm); padding: 13px 16px; outline: none; }
  .otp-boxes { display: flex; gap: 10px; }
  .otp-box { width: 48px; height: 56px; background: var(--surface-2); border: 1.5px solid var(--surface-3); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; font-family: var(--font-body); transition: all 0.2s; }
  .otp-box.filled { background: var(--indigo-pale); border-color: rgba(83,72,240,0.3); color: var(--indigo-deep); }
  .otp-box.cursor { border-color: var(--indigo-bright); background: white; animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { border-color: rgba(83,72,240,0.2); } }
  .aadh-verify-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, var(--indigo-bright), var(--indigo)); color: white; border: none; border-radius: var(--radius-sm); font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.25s; }
  .aadh-verify-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(83,72,240,0.35); }

  /* ── GSTIN SECTION ───────────────────────────── */
  .gstin-section {
    background: var(--indigo-deep);
    position: relative;
    overflow: hidden;
    padding: 100px 48px;
  }
  .gstin-section::before {
    content: '';
    position: absolute;
    top: -200px; right: -200px;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(83,72,240,0.3) 0%, transparent 70%);
    border-radius: 50%;
  }
  .gstin-section::after {
    content: '';
    position: absolute;
    bottom: -150px; left: -100px;
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(197,165,90,0.1) 0%, transparent 70%);
    border-radius: 50%;
  }
  .gstin-inner { max-width: 1280px; margin: 0 auto; position: relative; z-index: 2; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
  .gstin-content .section-eyebrow { color: #34d399; }
  .gstin-content .section-eyebrow::before { background: #34d399; }
  .gstin-content .section-h2 { color: white; }
  .gstin-content .section-sub { color: rgba(255,255,255,0.6); max-width: 440px; }
  .gstin-checks { margin-top: 36px; display: flex; flex-direction: column; gap: 14px; }
  .gstin-check-item { display: flex; align-items: flex-start; gap: 14px; }
  .check-icon-wrap { width: 28px; height: 28px; background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.25); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .check-icon-wrap::before { content: ''; width: 8px; height: 5px; border-left: 2px solid #34d399; border-bottom: 2px solid #34d399; transform: rotate(-45deg) translateY(-1px); }
  .gstin-check-text { font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.5; }
  .gstin-check-text strong { color: white; font-weight: 600; }

  .gstin-widget {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: var(--radius-xl);
    padding: 36px;
    backdrop-filter: blur(24px);
  }
  .gw-title { font-size: 18px; font-weight: 700; color: white; margin-bottom: 24px; }
  .gw-input { width: 100%; font-family: var(--font-mono); font-size: 15px; font-weight: 500; letter-spacing: 0.06em; color: white; background: rgba(255,255,255,0.07); border: 1.5px solid rgba(255,255,255,0.12); border-radius: var(--radius-sm); padding: 14px 18px; outline: none; margin-bottom: 14px; transition: border-color 0.2s; }
  .gw-input::placeholder { color: rgba(255,255,255,0.25); }
  .gw-input:focus { border-color: rgba(83,72,240,0.6); background: rgba(255,255,255,0.1); }
  .gw-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: var(--radius-sm); font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.25s; letter-spacing: 0.01em; }
  .gw-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(16,185,129,0.4); }

  /* ── PRICING ─────────────────────────────────── */
  .pricing-section { padding: 120px 48px; background: var(--surface); }
  .pricing-inner { max-width: 1280px; margin: 0 auto; }
  .pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 60px; }

  .plan-card {
    background: white;
    border-radius: var(--radius-lg);
    padding: 28px;
    border: 1.5px solid var(--surface-3);
    transition: all 0.35s;
    position: relative;
    overflow: hidden;
  }
  .plan-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(83,72,240,0.03) 0%, transparent 60%);
    opacity: 0;
    transition: opacity 0.35s;
  }
  .plan-card:hover { transform: translateY(-6px); box-shadow: 0 24px 60px rgba(0,0,0,0.1); border-color: rgba(83,72,240,0.2); }
  .plan-card:hover::before { opacity: 1; }
  .plan-card.popular {
    border-color: var(--indigo-bright);
    box-shadow: 0 8px 32px rgba(83,72,240,0.15);
    background: linear-gradient(160deg, white 0%, rgba(238,237,251,0.4) 100%);
  }
  .plan-popular-badge { background: var(--indigo-bright); color: white; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 5px 12px; border-radius: 100px; display: inline-block; margin-bottom: 16px; }
  .plan-name { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-muted); margin-bottom: 12px; }
  .plan-price { display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px; }
  .plan-currency { font-size: 18px; font-weight: 600; color: var(--indigo); margin-top: 6px; }
  .plan-amount { font-size: 48px; font-weight: 700; color: var(--indigo-deep); letter-spacing: -2px; line-height: 1; font-family: var(--font-body); }
  .plan-period { font-size: 13px; color: var(--ink-muted); margin-bottom: 10px; }
  .plan-tagline { font-size: 13px; color: var(--ink-soft); min-height: 40px; line-height: 1.5; font-weight: 300; margin-bottom: 20px; }
  .plan-divider { height: 1px; background: var(--surface-3); margin-bottom: 20px; }
  .plan-features { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
  .plan-feature { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--ink-soft); }
  .plan-feature-icon { width: 16px; height: 16px; background: var(--emerald-pale); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .plan-feature-icon::before { content: ''; width: 4px; height: 3px; border-left: 1.5px solid var(--emerald); border-bottom: 1.5px solid var(--emerald); transform: rotate(-45deg) translateY(-0.5px); display: block; }
  .plan-btn { width: 100%; padding: 13px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.25s; font-family: var(--font-body); }
  .plan-btn-outline { background: transparent; border: 1.5px solid rgba(83,72,240,0.3); color: var(--indigo); }
  .plan-btn-outline:hover { background: var(--indigo-pale); border-color: var(--indigo); }
  .plan-btn-fill { background: var(--indigo-bright); border: none; color: white; box-shadow: 0 4px 16px rgba(83,72,240,0.3); }
  .plan-btn-fill:hover { background: var(--indigo); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(83,72,240,0.4); }

  /* ── SECURITY ────────────────────────────────── */
  .security-section { padding: 100px 48px; background: var(--surface-2); }
  .security-inner { max-width: 1280px; margin: 0 auto; }
  .security-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 60px; }
  .sec-card {
    background: white;
    border-radius: var(--radius-lg);
    padding: 36px;
    border: 1px solid var(--surface-3);
    transition: all 0.3s;
    position: relative;
    overflow: hidden;
  }
  .sec-card::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(to right, var(--indigo-bright), var(--gold));
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.4s ease;
  }
  .sec-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-float); border-color: rgba(83,72,240,0.1); }
  .sec-card:hover::after { transform: scaleX(1); }
  .sec-icon {
    width: 60px;
    height: 60px;
    background: var(--indigo-pale);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
    color: var(--indigo-deep);
  }
  .sec-icon svg { width: 28px; height: 28px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .sec-title { font-size: 18px; font-weight: 700; color: var(--ink); margin-bottom: 8px; letter-spacing: -0.3px; }
  .sec-desc { font-size: 14px; color: var(--ink-soft); line-height: 1.6; font-weight: 300; margin-bottom: 16px; }
  .sec-chip { background: var(--indigo-pale); color: var(--indigo); font-family: var(--font-mono); font-size: 11px; font-weight: 500; padding: 5px 12px; border-radius: 100px; display: inline-block; letter-spacing: 0.03em; }

  /* ── CTA ─────────────────────────────────────── */
  .cta-section {
    background: var(--indigo-deep);
    padding: 120px 48px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .cta-section::before {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 800px; height: 500px;
    background: radial-gradient(ellipse, rgba(83,72,240,0.5) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }
  .cta-grid-texture {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  }
  .cta-inner { position: relative; z-index: 2; }
  .cta-eyebrow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: rgba(255,255,255,0.4); margin-bottom: 24px; }
  .cta-h2 { font-family: var(--font-display); font-size: clamp(44px, 6vw, 72px); color: white; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 20px; }
  .cta-h2 em { font-style: italic; color: #a5b4fc; }
  .cta-sub { font-size: 17px; color: rgba(255,255,255,0.5); margin-bottom: 48px; font-weight: 300; }
  .cta-buttons { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
  .btn-cta-primary { padding: 16px 40px; font-family: var(--font-body); font-size: 16px; font-weight: 700; background: white; color: var(--indigo-deep); border: none; border-radius: var(--radius-md); cursor: pointer; transition: all 0.3s; display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
  .btn-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 16px 40px rgba(255,255,255,0.2); }
  .btn-cta-ghost { padding: 16px 36px; font-family: var(--font-body); font-size: 16px; font-weight: 500; background: transparent; color: rgba(255,255,255,0.7); border: 1.5px solid rgba(255,255,255,0.2); border-radius: var(--radius-md); cursor: pointer; transition: all 0.3s; }
  .btn-cta-ghost:hover { border-color: rgba(255,255,255,0.5); color: white; transform: translateY(-2px); }
  .cta-note { font-size: 13px; color: rgba(255,255,255,0.3); margin-top: 24px; }

  /* ── FOOTER ──────────────────────────────────── */
  footer {
    background: #0c0a1a;
    padding: 72px 48px 40px;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .footer-top { max-width: 1280px; margin: 0 auto; display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 48px; margin-bottom: 60px; }
  .footer-brand-desc { font-size: 13px; color: rgba(255,255,255,0.35); line-height: 1.7; max-width: 220px; margin-top: 16px; font-weight: 300; }
  .footer-col-head { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.4); margin-bottom: 20px; }
  .footer-links { display: flex; flex-direction: column; gap: 12px; }
  .footer-links a { font-size: 13px; color: rgba(255,255,255,0.45); text-decoration: none; transition: color 0.2s; font-weight: 300; }
  .footer-links a:hover { color: rgba(255,255,255,0.85); }
  .footer-bottom { max-width: 1280px; margin: 0 auto; padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
  .footer-copy { font-size: 12px; color: rgba(255,255,255,0.25); }
  .footer-certs { display: flex; gap: 8px; }
  .footer-cert { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 100px; font-family: var(--font-mono); letter-spacing: 0.04em; }

  /* ── SCROLL ANIMATIONS ───────────────────────── */
  .reveal { opacity: 0; transform: translateY(32px); transition: opacity 0.7s ease, transform 0.7s ease; }
  .reveal.visible { opacity: 1; transform: translateY(0); }
  .reveal-delay-1 { transition-delay: 0.1s; }
  .reveal-delay-2 { transition-delay: 0.2s; }
  .reveal-delay-3 { transition-delay: 0.3s; }

  /* ── RESPONSIVE ──────────────────────────────── */
  @media (max-width: 1024px) {
    .hero { grid-template-columns: 1fr; padding-top: 120px; }
    .mockup-browser { transform: none; }
    .features-layout { grid-template-columns: 1fr; }
    .feature-preview { position: relative; top: 0; }
    .gstin-inner { grid-template-columns: 1fr; }
    .pricing-grid { grid-template-columns: repeat(2, 1fr); }
    .security-grid { grid-template-columns: repeat(2, 1fr); }
    .footer-top { grid-template-columns: 1fr 1fr; }
    body { cursor: auto; }
    #cursor, #cursor-trail { display: none; }
  }
  @media (max-width: 640px) {
    nav { padding: 14px 20px; }
    .nav-links { display: none; }
    .hero { padding: 100px 20px 60px; }
    .section { padding: 80px 20px; }
    .pricing-grid { grid-template-columns: 1fr; }
    .security-grid { grid-template-columns: 1fr; }
    .footer-top { grid-template-columns: 1fr; }
    .hero-h1 { font-size: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  }
</style>
</head>
<body>

<div id="cursor"></div>
<div id="cursor-trail"></div>

<!-- NAV -->
<nav>
  <a href="#" class="nav-logo">
    <div class="nav-logo-mark">B</div>
    <div class="nav-wordmark">
      <span>BillZo</span>
      <span>Sahi Bill. Safe Deal.</span>
    </div>
  </a>
  <ul class="nav-links">
    <li><a href="#features">Features</a></li>
    <li><a href="#pricing">Pricing</a></li>
    <li><a href="#security">Security</a></li>
    <li><a href="#">Aadhaar KYC</a></li>
  </ul>
  <div class="nav-cta">
    <a href="#" class="btn-ghost">Sign In</a>
    <a href="#" class="btn-primary">Start Free →</a>
  </div>
</nav>

<!-- HERO -->
<section style="padding-top: 0; position: relative; overflow: hidden;">
  <div class="hero-bg-orb"></div>
  <div class="hero-bg-orb-2"></div>
  <div class="hero">
    <div class="hero-content">
      <div class="hero-pill">
        <span class="hero-pill-dot"></span>
        GST-Ready · Aadhaar Verified · DPDP Compliant
      </div>
      <h1 class="hero-h1">
        Billing that<br>
        <em>understands</em><br>
        <span class="underline-word">Indian</span> business
      </h1>
      <p class="hero-tagline">Sahi bill. Safe deal.</p>
      <p class="hero-body">Create GST invoices, verify GSTIN and Aadhaar, manage your taxes—all in one clean workspace built for how India actually works.</p>
      <div class="hero-actions">
        <a href="#" class="btn-hero">Start Free <span style="font-size:16px;">→</span></a>
        <button class="btn-demo">
          <span class="demo-icon"></span>
          Watch Demo
        </button>
      </div>
      <div class="hero-trust">
        <div class="trust-avatars">
          <div class="trust-avatar">AK</div>
          <div class="trust-avatar">RS</div>
          <div class="trust-avatar">PM</div>
          <div class="trust-avatar">VG</div>
          <div class="trust-avatar" style="background: var(--indigo); color: white; font-size: 9px;">+∞</div>
        </div>
        <p class="trust-text">Trusted by <strong>50,000+</strong> Indian businesses</p>
      </div>
    </div>

    <div class="hero-visual">
      <div class="float-card float-card-1">
        <div class="fc-label">GSTIN Status</div>
        <div class="fc-val">27AABCU9603R1ZX</div>
        <div class="fc-active">Active & Verified</div>
      </div>

      <div class="mockup-browser">
        <div class="browser-chrome">
          <div class="browser-dots">
            <div class="browser-dot red"></div>
            <div class="browser-dot yellow"></div>
            <div class="browser-dot green"></div>
          </div>
          <div class="browser-url">app.billzo.in/dashboard</div>
        </div>
        <div class="browser-body">
          <div class="dashboard-header">
            <span class="dash-logo">BillZo</span>
            <span class="dash-badge">GST Ready</span>
          </div>
          <div class="stat-grid">
            <div class="stat-card">
              <div class="stat-label">Revenue</div>
              <div class="stat-val">₹2.4L</div>
              <div class="stat-delta delta-up">↑ 18% this month</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Invoices</div>
              <div class="stat-val">142</div>
              <div class="stat-delta delta-up">↑ 24 new</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">GST Due</div>
              <div class="stat-val">₹18.2K</div>
              <div class="stat-delta delta-warn">Due Dec 20</div>
            </div>
          </div>
          <div class="gstin-chip">
            <div class="gstin-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 11h.01"/><path d="M12 11h.01"/><path d="M15 11h.01"/><path d="M9 15h.01"/><path d="M12 15h.01"/><path d="M15 15h.01"/></svg>
            </div>
            <div class="gstin-info">
              <div class="gstin-sub">Your GSTIN</div>
              <div class="gstin-num">27AABCU9603R1ZX</div>
            </div>
            <div class="verified-pill">Verified</div>
          </div>
        </div>
      </div>

      <div class="float-card float-card-2">
        <div class="fc-row">
          <span class="fc-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M5 13a7 7 0 1 0 7-7"/><path d="m14 4 1.8-1.8a1.8 1.8 0 0 1 2.6 2.5L16.6 6.5"/><path d="M10 14 21 3"/><path d="M7 17l-3 3"/></svg>
          </span>
          <div>
            <div class="fc-text-sm">Invoice Sent!</div>
            <div class="fc-sub-sm">₹12,400 · via WhatsApp</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- MARQUEE -->
<div class="marquee-strip">
  <div class="marquee-track" id="marquee">
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 19a4 4 0 0 0-8 0"/><circle cx="12" cy="9" r="3"/><path d="M4 19a4 4 0 0 1 4-4"/><circle cx="8" cy="9" r="2"/><path d="M20 19a4 4 0 0 0-4-4"/><circle cx="16" cy="9" r="2"/></svg></span><span><strong>50,000+</strong> businesses trust BillZo</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v6h5"/><path d="M9 13h6"/><path d="M9 17h6"/></svg></span><span><strong>12 lakh+</strong> invoices created</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span><span>Invoice in <strong>under 60 seconds</strong></span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg></span><span><strong>AES-256</strong> bank-grade encryption</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2s7 3 7 9c0 6-7 11-7 11S5 17 5 11c0-6 7-9 7-9z"/><path d="M9 12h6"/></svg></span><span><strong>DPDP 2023</strong> compliant</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"/></svg></span><span><strong>GSTN</strong> certified portal</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg></span><span>WhatsApp & email <strong>delivery</strong></span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 19a4 4 0 0 0-8 0"/><circle cx="12" cy="9" r="3"/><path d="M4 19a4 4 0 0 1 4-4"/><circle cx="8" cy="9" r="2"/><path d="M20 19a4 4 0 0 0-4-4"/><circle cx="16" cy="9" r="2"/></svg></span><span><strong>50,000+</strong> businesses trust BillZo</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v6h5"/><path d="M9 13h6"/><path d="M9 17h6"/></svg></span><span><strong>12 lakh+</strong> invoices created</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span><span>Invoice in <strong>under 60 seconds</strong></span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg></span><span><strong>AES-256</strong> bank-grade encryption</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2s7 3 7 9c0 6-7 11-7 11S5 17 5 11c0-6 7-9 7-9z"/><path d="M9 12h6"/></svg></span><span><strong>DPDP 2023</strong> compliant</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"/></svg></span><span><strong>GSTN</strong> certified portal</span></div>
    <div class="marquee-item"><span class="icon-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg></span><span>WhatsApp & email <strong>delivery</strong></span></div>
  </div>
</div>

<!-- FEATURES -->
<section class="section" id="features">
  <div class="features-layout">
    <div>
      <div class="section-eyebrow reveal">Core Features</div>
      <h2 class="section-h2 reveal reveal-delay-1">Built for how<br><em>India</em> actually works</h2>
      <p class="section-sub reveal reveal-delay-2">Every feature designed around the complexity of Indian GST, verified identities, and how businesses really send invoices.</p>

      <div class="feature-tabs reveal reveal-delay-3">
        <div class="feature-tab active" data-tab="0" onclick="switchTab(0)">
          <div class="tab-num">01 / GST Invoicing</div>
          <div class="tab-title">GST invoices in 60 seconds</div>
          <div class="tab-desc">Auto-calculate CGST, SGST, IGST. Add HSN codes, discount rows, and send via WhatsApp or email in one tap.</div>
        </div>
        <div class="feature-tab" data-tab="1" onclick="switchTab(1)">
          <div class="tab-num">02 / GSTIN Verify</div>
          <div class="tab-title">Verify any GSTIN instantly</div>
          <div class="tab-desc">Check vendor GSTIN before payment. Live lookup from GSTN portal with auto-fill of business details.</div>
        </div>
        <div class="feature-tab" data-tab="2" onclick="switchTab(2)">
          <div class="tab-num">03 / Aadhaar KYC</div>
          <div class="tab-title">OTP-based Aadhaar onboarding</div>
          <div class="tab-desc">Add verified Aadhaar as business identity. Instant customer KYC with full UIDAI-compliant verification.</div>
        </div>
      </div>
    </div>

    <div>
      <div class="feature-preview reveal">
        <div class="preview-chrome">
          <div class="preview-dots">
            <span style="background:#ff5f57"></span>
            <span style="background:#febc2e"></span>
            <span style="background:#28c840"></span>
          </div>
        </div>
        <div class="preview-content">
          <!-- Invoice Panel -->
          <div class="preview-panel active" id="panel-0">
            <div class="inv-header">
              <div>
                <div class="inv-brand">BillZo</div>
                <div style="font-size:12px; color:var(--ink-muted); margin-top:4px;">Tax Invoice</div>
              </div>
              <div class="inv-meta">
                <div class="num">BZ-0142</div>
                <div class="date">Dec 15, 2024</div>
              </div>
            </div>
            <div style="display:flex; gap:20px; margin-bottom:20px;">
              <div style="flex:1;">
                <div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-muted); margin-bottom:5px;">Bill To</div>
                <div style="font-size:14px; font-weight:600; color:var(--ink);">Mehta Textiles Pvt Ltd</div>
                <div style="font-size:12px; color:var(--ink-muted); font-family:var(--font-mono);">27AABCU9603R1ZX</div>
              </div>
            </div>
            <div class="inv-row-head">
              <span>Item</span><span>Qty</span><span>Rate</span><span>Amt</span>
            </div>
            <div class="inv-row">
              <span>Linen Fabric</span><span>12m</span><span>₹2,200</span><span>₹26,400</span>
            </div>
            <div class="tax-row">
              <span class="tax-chip">CGST 9% = ₹2,376</span>
              <span class="tax-chip">SGST 9% = ₹2,376</span>
            </div>
            <div class="inv-total">
              <span class="inv-total-label">Total Amount</span>
              <span class="inv-total-amt">₹31,152</span>
            </div>
            <div class="send-btns">
              <button class="send-btn send-wa"><span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg></span>WhatsApp</button>
              <button class="send-btn send-email"><span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>Email PDF</button>
            </div>
          </div>

          <!-- GSTIN Panel -->
          <div class="preview-panel" id="panel-1">
            <div class="gstin-verify-wrap">
              <div class="verify-label">GSTIN Lookup</div>
              <div class="verify-input-row">
                <input class="verify-input" id="gstinInput" placeholder="27AABCU9603R1ZX" />
                <button class="verify-btn" onclick="showGstinResult()">Verify →</button>
              </div>
              <div class="verify-result" id="gstinResult">
                <div class="vr-status">
                  <span class="vr-badge">Active</span>
                  <span class="vr-name">Mehta Textiles Pvt Ltd</span>
                </div>
                <div class="vr-grid">
                  <div class="vr-item"><div class="lbl">State</div><div class="val">Maharashtra</div></div>
                  <div class="vr-item"><div class="lbl">Status</div><div class="val val-active">Active</div></div>
                  <div class="vr-item"><div class="lbl">Reg. Type</div><div class="val">Regular</div></div>
                  <div class="vr-item"><div class="lbl">Category</div><div class="val">Business</div></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Aadhaar Panel -->
          <div class="preview-panel" id="panel-2">
            <div class="aadhaar-header">
              <div class="aadhaar-flag">आधार</div>
              <div>
                <div class="aadhaar-title">Aadhaar Verification</div>
                <div class="aadhaar-sub">UIDAI-compliant KYC</div>
              </div>
            </div>
            <div class="aadh-field">
              <div class="aadh-field-label">Aadhaar Number</div>
              <input class="aadh-input" value="XXXX  XXXX  4821" readonly />
            </div>
            <div class="aadh-field">
              <div class="aadh-field-label">One-Time Password</div>
              <div class="otp-boxes">
                <div class="otp-box filled">8</div>
                <div class="otp-box filled">4</div>
                <div class="otp-box filled">2</div>
                <div class="otp-box filled">1</div>
                <div class="otp-box cursor"></div>
                <div class="otp-box"></div>
              </div>
            </div>
            <button class="aadh-verify-btn"><span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg></span>Verify with Aadhaar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- GSTIN SECTION -->
<div class="gstin-section">
  <div class="gstin-inner">
    <div class="gstin-content">
      <div class="section-eyebrow reveal">GSTIN Intelligence</div>
      <h2 class="section-h2 reveal reveal-delay-1">Know who you're<br>dealing with</h2>
      <p class="section-sub reveal reveal-delay-2">Instantly verify any GSTIN before raising an invoice. BillZo pulls live data from the GSTN portal in under 2 seconds.</p>
      <div class="gstin-checks reveal reveal-delay-3">
        <div class="gstin-check-item">
          <div class="check-icon-wrap"></div>
          <div class="gstin-check-text"><strong>Live GSTN lookup</strong> — real-time data from government portal</div>
        </div>
        <div class="gstin-check-item">
          <div class="check-icon-wrap"></div>
          <div class="gstin-check-text"><strong>Auto-fills invoice</strong> — business name, address populated instantly</div>
        </div>
        <div class="gstin-check-item">
          <div class="check-icon-wrap"></div>
          <div class="gstin-check-text"><strong>Flags suspicious GSTINs</strong> — cancelled or invalid registrations flagged</div>
        </div>
        <div class="gstin-check-item">
          <div class="check-icon-wrap"></div>
          <div class="gstin-check-text"><strong>HSN code validation</strong> — ensure correct tax classification</div>
        </div>
      </div>
    </div>
    <div class="reveal reveal-delay-2">
      <div class="gstin-widget">
        <div class="gw-title">GSTIN Instant Check</div>
        <input class="gw-input" placeholder="Enter GSTIN e.g. 27AABCU9603R1ZX" />
        <button class="gw-btn">→ Verify Now</button>
      </div>
    </div>
  </div>
</div>

<!-- PRICING -->
<section class="pricing-section" id="pricing">
  <div class="pricing-inner">
    <div class="section-eyebrow reveal">Pricing</div>
    <h2 class="section-h2 reveal reveal-delay-1">Transparent pricing.<br><em>No surprises.</em></h2>
    <p class="section-sub reveal reveal-delay-2">Start free, grow as you scale. Every plan includes GST calculation, PDF export, and WhatsApp delivery.</p>

    <div class="pricing-grid">
      <div class="plan-card reveal">
        <div class="plan-name">Starter</div>
        <div class="plan-price"><span class="plan-currency">₹</span><span class="plan-amount">0</span></div>
        <div class="plan-period">Forever free</div>
        <div class="plan-tagline">Perfect for new businesses starting with GST billing.</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="plan-feature"><div class="plan-feature-icon"></div>25 invoices/month</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>GSTIN verify (10/mo)</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>PDF export</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>WhatsApp delivery</div>
        </div>
        <button class="plan-btn plan-btn-outline">Start Free</button>
      </div>

      <div class="plan-card popular reveal reveal-delay-1">
        <div class="plan-popular-badge">Most Popular</div>
        <div class="plan-name">Basic</div>
        <div class="plan-price"><span class="plan-currency">₹</span><span class="plan-amount">199</span></div>
        <div class="plan-period">/month · billed monthly</div>
        <div class="plan-tagline">Ideal for small shops and individual professionals.</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="plan-feature"><div class="plan-feature-icon"></div>200 invoices/month</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>GSTIN verify (50/mo)</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>Auto-GST calculation</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>Email support</div>
        </div>
        <button class="plan-btn plan-btn-fill">Start Basic</button>
      </div>

      <div class="plan-card reveal reveal-delay-2">
        <div class="plan-name">Professional</div>
        <div class="plan-price"><span class="plan-currency">₹</span><span class="plan-amount">499</span></div>
        <div class="plan-period">/month · billed monthly</div>
        <div class="plan-tagline">For growing businesses with regular billing needs.</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="plan-feature"><div class="plan-feature-icon"></div>1,000 invoices/month</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>Unlimited GSTIN verify</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>Aadhaar KYC included</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>Priority support</div>
        </div>
        <button class="plan-btn plan-btn-outline">Go Pro</button>
      </div>

      <div class="plan-card reveal reveal-delay-3">
        <div class="plan-name">Enterprise</div>
        <div class="plan-price"><span class="plan-currency">₹</span><span class="plan-amount">1499</span></div>
        <div class="plan-period">/month · billed monthly</div>
        <div class="plan-tagline">For CA firms, distributors and large businesses.</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="plan-feature"><div class="plan-feature-icon"></div>Unlimited invoices</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>Unlimited Aadhaar KYC</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>API access</div>
          <div class="plan-feature"><div class="plan-feature-icon"></div>Dedicated manager</div>
        </div>
        <button class="plan-btn plan-btn-outline">Contact Sales</button>
      </div>
    </div>
  </div>
</section>

<!-- SECURITY -->
<section class="security-section" id="security">
  <div class="security-inner">
    <div class="section-eyebrow reveal">Security & Compliance</div>
    <h2 class="section-h2 reveal reveal-delay-1">Your data is<br><em>safer here</em></h2>
    <p class="section-sub reveal reveal-delay-2">Built on Indian data infrastructure with the same encryption standards used by banks.</p>

    <div class="security-grid">
      <div class="sec-card reveal">
        <div class="sec-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg></div>
        <div class="sec-title">Bank-grade Encryption</div>
        <div class="sec-desc">Every piece of data is encrypted at rest and in transit using AES-256 and TLS 1.3 — the same standards used by major banks.</div>
        <span class="sec-chip">AES-256 · TLS 1.3</span>
      </div>
      <div class="sec-card reveal reveal-delay-1">
        <div class="sec-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.7 2.5 2.7 15.5 0 18"/><path d="M12 3c-2.7 2.5-2.7 15.5 0 18"/></svg></div>
        <div class="sec-title">India Data Residency</div>
        <div class="sec-desc">All your data stays within Indian borders. Fully compliant with DPDP 2023 and MeitY data localisation guidelines.</div>
        <span class="sec-chip">DPDP 2023 · MeitY</span>
      </div>
      <div class="sec-card reveal reveal-delay-2">
        <div class="sec-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="4" rx="1"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 12h6"/><path d="M9 16h4"/></svg></div>
        <div class="sec-title">GST & UIDAI Compliance</div>
        <div class="sec-desc">GSTN-certified integration for live GSTIN lookups. Aadhaar verification via official UIDAI APIs — no third-party middlemen.</div>
        <span class="sec-chip">GSTN · UIDAI</span>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="cta-grid-texture"></div>
  <div class="cta-inner">
    <div class="cta-eyebrow">Get started today</div>
    <h2 class="cta-h2">Shuru karo <em>aaj.</em></h2>
    <p class="cta-sub">First invoice free. No credit card. No setup fee.</p>
    <div class="cta-buttons">
      <a href="#" class="btn-cta-primary">Create Free Account →</a>
      <button class="btn-cta-ghost">Talk to Expert</button>
    </div>
    <p class="cta-note">No credit card required · No setup fee · Cancel anytime</p>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="footer-top">
    <div>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
        <div class="nav-logo-mark" style="width:32px; height:32px; font-size:16px;">B</div>
        <div>
          <div style="font-size:16px; font-weight:600; color:white; letter-spacing:-0.5px;">BillZo</div>
          <div style="font-size:9px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.35); margin-top:1px;">Sahi Bill. Safe Deal.</div>
        </div>
      </div>
      <p class="footer-brand-desc">India's most trusted GST billing platform. Built for the way India works.</p>
    </div>
    <div>
      <div class="footer-col-head">Product</div>
      <div class="footer-links">
        <a href="#">Invoicing</a>
        <a href="#">GSTIN Verify</a>
        <a href="#">Aadhaar KYC</a>
        <a href="#">Pricing</a>
        <a href="#">API Access</a>
      </div>
    </div>
    <div>
      <div class="footer-col-head">Company</div>
      <div class="footer-links">
        <a href="#">About</a>
        <a href="#">Blog</a>
        <a href="#">Careers</a>
        <a href="#">Press</a>
      </div>
    </div>
    <div>
      <div class="footer-col-head">Support</div>
      <div class="footer-links">
        <a href="#">Help Center</a>
        <a href="#">API Docs</a>
        <a href="#">Status</a>
        <a href="#">Contact</a>
      </div>
    </div>
    <div>
      <div class="footer-col-head">Legal</div>
      <div class="footer-links">
        <a href="#">Privacy Policy</a>
        <a href="#">Terms of Service</a>
        <a href="#">DPDP Compliance</a>
        <a href="#">Refund Policy</a>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <p class="footer-copy">© 2024 BillZo Technologies Pvt Ltd · Made with care in India</p>
    <div class="footer-certs">
      <span class="footer-cert">GSTN</span>
      <span class="footer-cert">UIDAI</span>
      <span class="footer-cert">DPDP</span>
      <span class="footer-cert">MeitY</span>
    </div>
  </div>
</footer>

<script>
  // Custom cursor
  const cursor = document.getElementById('cursor');
  const trail = document.getElementById('cursor-trail');
  let mx = 0, my = 0, tx = 0, ty = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; cursor.style.left = mx + 'px'; cursor.style.top = my + 'px'; });
  function animTrail() { tx += (mx - tx) * 0.12; ty += (my - ty) * 0.12; trail.style.left = tx + 'px'; trail.style.top = ty + 'px'; requestAnimationFrame(animTrail); }
  animTrail();

  // Reveal on scroll
  const reveals = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(el => obs.observe(el));

  // Feature tabs
  function switchTab(idx) {
    document.querySelectorAll('.feature-tab').forEach((t,i) => t.classList.toggle('active', i === idx));
    document.querySelectorAll('.preview-panel').forEach((p,i) => p.classList.toggle('active', i === idx));
  }

  // GSTIN verify
  function showGstinResult() {
    const input = document.getElementById('gstinInput').value.trim();
    if (input.length >= 5) {
      document.getElementById('gstinResult').classList.add('show');
    }
  }
  document.getElementById('gstinInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') showGstinResult(); });

  // Nav shrink on scroll
  const nav = document.querySelector('nav');
  window.addEventListener('scroll', () => {
    nav.style.padding = window.scrollY > 60 ? '12px 48px' : '18px 48px';
    nav.style.boxShadow = window.scrollY > 60 ? '0 2px 20px rgba(0,0,0,0.08)' : 'none';
  });
</script>
</body>
</html>