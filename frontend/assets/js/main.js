/**
* Template Name: Ecom Inteligente - Otimizado
* Updated: 17 de abril de 2026
*/
(function () {
  "use strict";

  /**
   * SELETORES GLOBAIS (Cache para evitar buscas repetitivas no DOM)
   */
  const body = document.querySelector('body');
  const header = document.querySelector('#header');
  const scrollTop = document.querySelector('.scroll-top');
  const mobileNavToggleBtn = document.querySelector('.mobile-nav-toggle');

  /**
   * 1. GERENCIAMENTO DE SCROLL (Sticky Header & Botão Topo)
   * Otimizado para rodar com listener passivo
   */
  function handleScroll() {
    const isScrolled = window.scrollY > 100;

    // Header Sticky
    if (header && (header.classList.contains('scroll-up-sticky') || 
                   header.classList.contains('sticky-top') || 
                   header.classList.contains('fixed-top'))) {
      isScrolled ? body.classList.add('scrolled') : body.classList.remove('scrolled');
    }

    // Botão Voltar ao Topo
    if (scrollTop) {
      isScrolled ? scrollTop.classList.add('active') : scrollTop.classList.remove('active');
    }
  }

  // Listener passivo melhora a fluidez do scroll e a nota de performance
  document.addEventListener('scroll', handleScroll, { passive: true });

  /**
   * 2. NAVEGAÇÃO MOBILE
   */
  if (mobileNavToggleBtn) {
    mobileNavToggleBtn.addEventListener('click', () => {
      body.classList.toggle('mobile-nav-active');
      mobileNavToggleBtn.classList.toggle('bi-list');
      mobileNavToggleBtn.classList.toggle('bi-x');
    });
  }

  // Fechar menu ao clicar em links
  document.querySelectorAll('#navmenu a').forEach(link => {
    link.addEventListener('click', () => {
      if (body.classList.contains('mobile-nav-active')) {
        body.classList.remove('mobile-nav-active');
        if (mobileNavToggleBtn) {
          mobileNavToggleBtn.classList.add('bi-list');
          mobileNavToggleBtn.classList.remove('bi-x');
        }
      }
    });
  });

  // Dropdown Mobile
  document.querySelectorAll('.navmenu .toggle-dropdown').forEach(toggle => {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      const parent = this.parentNode;
      const submenu = parent.nextElementSibling;

      parent.classList.toggle('active');
      if (submenu) submenu.classList.toggle('dropdown-active');
      e.stopImmediatePropagation();
    });
  });

  /**
   * 3. INICIALIZAÇÃO ASSÍNCRONA (Executa assim que o HTML estiver pronto)
   */
  document.addEventListener('DOMContentLoaded', () => {
    
    // AOS - Animações (Iniciando antes das imagens para evitar delay visual)
    if (typeof AOS !== 'undefined') {
      AOS.init({
        duration: 600,
        easing: 'ease-in-out',
        once: true,
        mirror: false
      });
    }

    // GLightbox (Galeria)
    if (typeof GLightbox !== 'undefined') {
      GLightbox({ selector: '.glightbox' });
    }

    // FAQ Accordion
    document.querySelectorAll('.faq-item h3, .faq-item .faq-toggle').forEach(el => {
      el.addEventListener('click', () => {
        el.parentNode.classList.toggle('faq-active');
      });
    });

    // Scroll Top Click
    if (scrollTop) {
      scrollTop.addEventListener('click', e => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  });

  /**
   * 4. ISOTOPE & IMAGENS (Executa apenas após o carregamento total)
   * Necessário esperar 'load' para cálculos de layout de mosaico
   */
  function initIsotope() {
    document.querySelectorAll('.isotope-layout').forEach(layout => {
      const container = layout.querySelector('.isotope-container');
      if (!container || typeof Isotope === 'undefined' || typeof imagesLoaded === 'undefined') return;

      imagesLoaded(container, () => {
        const iso = new Isotope(container, {
          itemSelector: '.isotope-item',
          layoutMode: layout.dataset.layout || 'masonry',
          filter: layout.dataset.defaultFilter || '*',
          sortBy: layout.dataset.sort || 'original-order',
          transitionDuration: '0.6s'
        });

        layout.querySelectorAll('.isotope-filters li').forEach(filter => {
          filter.addEventListener('click', function () {
            layout.querySelector('.filter-active').classList.remove('filter-active');
            this.classList.add('filter-active');
            iso.arrange({ filter: this.dataset.filter });
            if (typeof AOS !== 'undefined') AOS.refresh();
          });
        });
      });
    });
  }

  window.addEventListener('load', () => {
    initIsotope();
    handleScroll(); // Garantir estado correto do header após carregar
  });

  /**
   * FECHAR MENU AO CLICAR FORA
   */
  document.addEventListener('click', function (e) {
    const navMenuUl = document.querySelector('.navmenu ul');
    if (body.classList.contains('mobile-nav-active') && navMenuUl && mobileNavToggleBtn) {
      if (!navMenuUl.contains(e.target) && !mobileNavToggleBtn.contains(e.target)) {
        body.classList.remove('mobile-nav-active');
        mobileNavToggleBtn.classList.add('bi-list');
        mobileNavToggleBtn.classList.remove('bi-x');
      }
    }
  });

})();