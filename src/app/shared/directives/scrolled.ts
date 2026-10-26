import { Directive, signal, inject, DestroyRef, input } from '@angular/core';

/**
 * Expose un signal `scrolled` qui passe à vrai quand la fenêtre a défilé
 * au-delà d'un seuil. Sert à « lever » la barre compacte figée.
 *
 *   <div appScrolled #s="scrolled" [threshold]="80">
 *     <div class="topbar" [class.raised]="s.scrolled()">…
 */
@Directive({
  selector: '[appScrolled]',
  exportAs: 'scrolled',
})
export class Scrolled {
  readonly threshold = input(72);
  readonly scrolled = signal(false);

  constructor() {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const next = y > this.threshold();
      if (next !== this.scrolled()) this.scrolled.set(next);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', onScroll));
  }
}
