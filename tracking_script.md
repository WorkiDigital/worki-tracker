# Scripts de Instalação — Worki Tracker

Siga as instruções abaixo para instalar o rastreamento na sua Landing Page. Substitua `https://seu-tracker.com` pela URL real do seu servidor de tracking.

### 1. No <head> da sua Landing Page
Este código inicializa a identificação do visitante e o Meta Pixel padrão.

```html
<!-- Worki Tracker — Initialization & Meta Pixel -->
<script>
    // Configurações Globais
    const WK_CONFIG = {
        endpoint: 'https://seu-tracker.com/api/track/events',
        pixelId: '990028642721674' // Seu Pixel ID
    };

    // Inicialização do Meta Pixel Padrão
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', WK_CONFIG.pixelId);
    fbq('track', 'PageView');

    // Gerador de Visitor ID (Blindado)
    function getVisitorId() {
        let vid = localStorage.getItem('wk_visitor_id');
        if (!vid) {
            vid = 'wk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
            localStorage.setItem('wk_visitor_id', vid);
        }
        return vid;
    }

    // Gerador de Session ID
    function getSessionId() {
        let sid = sessionStorage.getItem('wk_session_id');
        if (!sid) {
            sid = 'swk_' + Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem('wk_session_id', sid);
        }
        return sid;
    }

    window.WK_VISITOR_ID = getVisitorId();
    window.WK_SESSION_ID = getSessionId();
</script>
```

### 2. No final do <body> da sua Landing Page
Este código captura eventos (cliques, scroll, formulários) e envia para o seu dashboard.

```html
<!-- Worki Tracker — Tracking Logic -->
<script>
    (function() {
        // Captura Parâmetros Meta Ads na URL
        const urlParams = new URLSearchParams(window.location.search);
        const metaParams = {
            fbclid: urlParams.get('fbclid'),
            fbc: urlParams.get('fbc') || (cookieMatch = document.cookie.match(/_fbc=([^;]+)/)) ? cookieMatch[1] : null,
            fbp: urlParams.get('fbp') || (cookieMatch = document.cookie.match(/_fbp=([^;]+)/)) ? cookieMatch[1] : null
        };

        // Função para enviar eventos
        async function trackEvent(name, data = {}) {
            const payload = {
                visitor_id: window.WK_VISITOR_ID,
                session_id: window.WK_SESSION_ID,
                event: name,
                page: document.title,
                url: window.location.href,
                data: {
                    ...data,
                    utm: {
                        source: urlParams.get('utm_source'),
                        medium: urlParams.get('utm_medium'),
                        campaign: urlParams.get('utm_campaign')
                    },
                    device: {
                        type: window.innerWidth < 768 ? 'mobile' : 'desktop',
                        os: navigator.platform,
                        browser: navigator.userAgent,
                        screen: window.innerWidth + 'x' + window.innerHeight
                    },
                    meta: metaParams,
                    referrer: document.referrer
                }
            };

            try {
                await fetch(WK_CONFIG.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (e) {
                console.warn('[Worki] Falha ao enviar evento:', name);
            }
        }

        // 1. Rastrear Pageview
        trackEvent('pageview');

        // 2. Rastrear Cliques em WhatsApp e Botões
        document.addEventListener('click', (e) => {
            const target = e.target.closest('a, button');
            if (target) {
                trackEvent('click', {
                    text: target.innerText || target.value,
                    id: target.id,
                    class: target.className,
                    href: target.href || 'button'
                });
            }
        });

        // 3. Captura de Formulários Inteligente (Case-Insensitive)
        document.addEventListener('submit', (e) => {
            const form = e.target;
            const formData = new FormData(form);
            const fields = {};
            
            for (let [key, value] of formData.entries()) {
                // Captura todos os campos
                fields[key] = value;
            }

            trackEvent('form_submit', { fields });
            
            // Avisar o Meta Pixel Padrão
            if (typeof fbq === 'function') {
                fbq('track', 'Lead');
            }
        });

        // 4. Scroll Tracking
        let maxScroll = 0;
        window.addEventListener('scroll', () => {
            const scroll = Math.round((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
            if (scroll > maxScroll && scroll % 25 === 0) {
                maxScroll = scroll;
                trackEvent('scroll', { depth: maxScroll });
            }
        });
    })();
</script>
```
