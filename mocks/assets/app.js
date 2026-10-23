/* Potrero mocks (Tailwind 4): iconos, shell y microinteracciones */
(function(){
  var P={
    home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.5 3.5 5"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    wallet:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    check:'<path d="M5 12.5l4.5 4.5L19 7"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
    ball:'<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/><path d="M12 3v4M16 10l4-1M14.5 15l2.5 4M9.5 15L7 19M8 10L4 9"/>',
    card:'<rect x="7" y="3" width="10" height="18" rx="2"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
    up:'<path d="M7 17L17 7M8 7h9v9"/>',chev:'<path d="M9 6l6 6-6 6"/>',
    share:'<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    whatsapp:'<path d="M3 21l1.5-5A8.5 8.5 0 1 1 8 19.5z"/><path d="M9 9c0 3 3 6 6 6l1.5-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z"/>',
    link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',pin:'<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',camera:'<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
    trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',swap:'<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    dots:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    download:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',sub:'<path d="M8 4v14M4 14l4 4 4-4M16 20V6M12 10l4-4 4 4"/>',
    whistle:'<circle cx="9" cy="15" r="5"/><path d="M13 12l8-5M9 10V6"/>',id:'<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="12" r="2"/><path d="M14 10h4M14 14h4"/>',cloud:'<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9.5 4 4 0 0 1 17 18z"/><path d="M9 21l1-2M13 21l1-2"/>',send:'<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',lock:'<rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'
  };
  function svg(n,cls){cls=cls||'';return '<svg class="'+cls+(/size-/.test(cls)?'':' size-[1.2em]')+' shrink-0 fill-none stroke-current" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">'+(P[n]||'')+'</svg>'}
  function paint(root){(root||document).querySelectorAll('[data-i]').forEach(function(e){var c=e.getAttribute('class')||'';e.outerHTML=svg(e.dataset.i,c)})}

  var body=document.body, shell=body.dataset.shell, on=body.dataset.on;
  var LOGO='<span class="grid size-9 place-items-center rounded-2xl bg-volt text-ink text-lg" data-i="ball"></span>';

  if(shell==='org'){
    var groups=[['Operación',[['01-dashboard.html','home','Panel','1'],['02-crear-torneo.html','trophy','Torneos','2'],['03-inscripciones.html','users','Inscripciones','3'],['04-fixture.html','cal','Fixture','4'],['17-llaves.html','bolt','Llaves','17'],['11-reprogramaciones.html','cloud','Reprogramar','11'],['05-acta.html','whistle','Actas','5']]],
      ['Control',[['12-sanciones.html','flag','Sanciones','12'],['13-documentacion.html','id','Documentación','13'],['15-arbitros-canchas.html','pin','Árbitros y canchas','15']]],
      ['Negocio',[['14-caja.html','wallet','Caja','14'],['16-comunicacion.html','whatsapp','Comunicación','16'],['18-sponsors.html','star','Sponsors','18'],['19-metricas.html','trend','Métricas','19']]],
      ['Cuenta',[['06-sitio-publico.html','globe','Sitio público','6'],['20-onboarding.html','gear','Configuración','20']]]];
    var badges={'3':'5','11':'2','12':'3','13':'4'};
    var nav=groups.map(function(g){return '<div class="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35">'+g[0]+'</div>'+g[1].map(function(i){var a=on===i[3];return '<a href="'+i[0]+'" class="group flex items-center gap-3 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition '+(a?'bg-volt text-ink font-semibold':'text-white/65 hover:bg-white/10 hover:text-white')+'"><span data-i="'+i[1]+'" class="text-[1.05rem]"></span>'+i[2]+(badges[i[3]]?'<span class="ml-auto grid min-w-5 place-items-center rounded-full '+(a?'bg-ink text-volt':'bg-red-500 text-white')+' px-1.5 text-[11px] font-bold">'+badges[i[3]]+'</span>':'')+'</a>'}).join('')}).join('');
    var side='<aside id="sb" class="fixed inset-y-3 left-3 z-50 flex w-64 -translate-x-[110%] flex-col gap-1 overflow-hidden rounded-4xl bg-ink p-4 text-white shadow-2xl transition-transform duration-300 lg:translate-x-0">'+
      '<div class="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-volt/20 blur-3xl"></div><div class="relative flex h-full min-h-0 flex-col gap-0.5"><div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1 [scrollbar-width:none]">'+
      '<a href="01-dashboard.html" class="flex items-center gap-2.5 px-1.5 pb-4 pt-1 text-xl font-bold tracking-tight">'+LOGO+'Potrero</a>'+
      '<div class="mb-2 flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur"><span class="grid size-10 place-items-center rounded-xl bg-volt text-sm font-extrabold text-ink">LB</span><div class="min-w-0 leading-tight"><b class="block truncate text-sm">Liga Barrial Sur</b><span class="text-xs text-white/50">Plan Liga</span></div></div>'+
      nav+'</div><div class="mt-2 rounded-2xl bg-white/10 p-3.5 text-xs text-white/60"><div class="mb-1 flex items-center gap-1.5 font-semibold text-volt"><span data-i="spark"></span>Comisión 3,5%</div>Mercado Pago conectado. Cobrás directo en tu cuenta.</div></div></aside>';
    var top='<header class="sticky top-3 z-40 mx-4 mt-3 flex items-center gap-3 rounded-full glass py-2 pl-2 pr-2 sm:mx-6">'+
      '<button id="mbtn" class="grid size-10 place-items-center rounded-full bg-ink text-white lg:hidden" aria-label="Menú"><span data-i="menu"></span></button>'+
      '<label class="hidden min-w-0 flex-1 items-center gap-2.5 rounded-full bg-black/5 px-4 py-2.5 text-sm text-mute sm:flex sm:max-w-md"><span data-i="search"></span><input class="w-full bg-transparent outline-none placeholder:text-mute" placeholder="Buscar equipo, jugador o torneo"></label>'+
      '<span class="px-2 text-sm font-semibold sm:hidden">Liga Barrial Sur</span>'+
      '<div class="ml-auto flex items-center gap-2"><button class="relative grid size-10 place-items-center rounded-full bg-white/80 hover:bg-white" aria-label="Notificaciones"><span data-i="bell"></span><span class="absolute right-2.5 top-2.5 size-2 rounded-full bg-red-500 ring-2 ring-white"></span></button><div class="flex items-center gap-2 rounded-full bg-white/80 py-1 pl-1 pr-3.5 text-sm font-semibold"><span class="grid size-8 place-items-center rounded-full bg-ink text-xs font-bold text-volt">LV</span><span class="hidden sm:inline">Lucas V.</span></div></div></header>';
    var s=document.getElementById('side'),t=document.getElementById('top');
    if(s)s.outerHTML=side; if(t)t.outerHTML=top;
    var dock=[['01-dashboard.html','home','1'],['02-crear-torneo.html','trophy','2'],['04-fixture.html','cal','4'],['03-inscripciones.html','wallet','3']].map(function(i){var a=on===i[2];return '<a href="'+i[0]+'" class="grid size-12 place-items-center rounded-full text-xl transition '+(a?'bg-volt text-ink':'text-white/70')+'"><span data-i="'+i[1]+'"></span></a>'}).join('')+'<a href="#" id="more" class="grid size-12 place-items-center rounded-full text-xl text-white/70"><span data-i="menu"></span></a>';
    var d=document.createElement('nav');d.className='fixed inset-x-5 bottom-4 z-40 mx-auto flex max-w-sm items-center justify-between rounded-full bg-ink/95 p-1.5 shadow-2xl backdrop-blur-xl lg:hidden';d.innerHTML=dock;body.appendChild(d);
    var sc=document.createElement('div');sc.id='scrim';sc.className='fixed inset-0 z-40 hidden bg-black/40 backdrop-blur-sm lg:hidden';body.appendChild(sc);
    document.addEventListener('click',function(e){
      var sb=document.getElementById('sb');
      if(e.target.closest('#mbtn,#more')){e.preventDefault();sb.classList.toggle('-translate-x-[110%]');sc.classList.toggle('hidden')}
      else if(e.target.id==='scrim'){sb.classList.add('-translate-x-[110%]');sc.classList.add('hidden')}
    });
  }
  if(shell==='pub'){
    var tag=body.dataset.tag||'';
    var h='<header class="sticky top-3 z-40 mx-auto mt-3 flex max-w-6xl items-center gap-3 rounded-full glass py-2 pl-2 pr-2" style="width:calc(100% - 1.5rem)">'+
      '<a href="index.html" class="flex items-center gap-2.5 text-lg font-bold tracking-tight">'+LOGO+'<span class="hidden sm:inline">Potrero</span></a>'+
      (tag?'<span class="pill-volt ml-1">'+tag+'</span>':'')+
      '<div class="ml-auto flex items-center gap-2"><button class="btn-glass btn-sm"><span data-i="share"></span><span class="hidden sm:inline">Compartir</span></button><a href="01-dashboard.html" class="btn btn-sm">Panel<span data-i="up"></span></a></div></header>';
    var t2=document.getElementById('top'); if(t2)t2.outerHTML=h;
  }
  paint();

  /* tabs / segmented / chips */
  document.addEventListener('click',function(e){
    var b=e.target.closest('.tabs > *, .seg > *, [data-single]'); if(!b)return;
    var p=b.parentElement; if(b.tagName==='A'&&b.getAttribute('href')&&b.getAttribute('href')!=='#')return;
    e.preventDefault();[].forEach.call(p.children,function(c){c.classList.remove('on')});b.classList.add('on');
  });
  /* contadores */
  document.querySelectorAll('[data-count]').forEach(function(el){
    var end=parseFloat(el.dataset.count),pre=el.dataset.pre||'',dec=+el.dataset.dec||0,t0=null;
    if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=pre+end.toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec});return}
    function f(ts){t0=t0||ts;var k=Math.min((ts-t0)/900,1),v=end*(1-Math.pow(1-k,3));
      el.textContent=pre+v.toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec});if(k<1)requestAnimationFrame(f)}
    requestAnimationFrame(f);
  });
  /* toggles */
  document.addEventListener('click',function(e){var t=e.target.closest('.toggle');if(t)t.classList.toggle('on')});
})();
