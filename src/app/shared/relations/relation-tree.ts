import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TreeNode } from './relations';

const KIND_CLASSES: Record<string, string> = {
  service:
    'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100',
  operation:
    'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
  database:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100',
  object:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
  member:
    'border-orange-200 bg-white text-orange-900 dark:border-orange-500/30 dark:bg-slate-900 dark:text-orange-200',
  warning:
    'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
};

/** Orden para todo el árbol: expandir o contraer (seq cambia en cada clic). */
export interface TreeCommand {
  collapse: boolean;
  seq: number;
}

/** Nodo del árbol de dependencias con sus hijos (recursivo), unidos con líneas. */
@Component({
  selector: 'app-relation-tree',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let item = node();
    <div class="flex items-start gap-1">
      @if (item.children.length) {
        <button
          type="button"
          class="btn-icon mt-1 size-6 shrink-0 text-xs"
          [attr.aria-label]="(collapsed() ? 'Expandir ' : 'Contraer ') + item.label"
          [attr.aria-expanded]="!collapsed()"
          (click)="collapsed.set(!collapsed())"
        >
          {{ collapsed() ? '+' : '−' }}
        </button>
      } @else {
        <span class="size-6 shrink-0"></span>
      }
      <div
        class="inline-flex max-w-full min-w-0 flex-col rounded-md border px-2.5 py-1.5 text-sm"
        [class]="kindClass(item.kind)"
        [attr.data-kind]="item.kind"
        [attr.title]="item.title || null"
      >
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          @if (item.badge) {
            <span class="shrink-0 rounded bg-black/5 px-1.5 font-mono text-xs dark:bg-white/10">{{
              item.badge
            }}</span>
          }
          @if (item.link) {
            <a class="font-medium break-all hover:underline" [routerLink]="item.link">{{
              item.label
            }}</a>
          } @else {
            <span class="font-medium break-all" [class.font-mono]="item.kind !== 'warning'">{{
              item.label
            }}</span>
          }
          @if (item.flag) {
            <span
              class="rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
              data-testid="tree-flag"
              >⚠ {{ item.flag }}</span
            >
          }
          @if (collapsed() && item.children.length) {
            <span class="text-xs opacity-60">{{ item.children.length }} ▸</span>
          }
        </span>
        @if (item.detail) {
          <span class="mt-0.5 max-w-[60ch] truncate text-xs opacity-70">{{ item.detail }}</span>
        }
      </div>
    </div>
    @if (item.children.length && !collapsed()) {
      <ul class="ms-3 border-s border-slate-300 ps-4 dark:border-slate-600" role="group">
        @for (child of item.children; track $index) {
          <li
            class="relative mt-2 before:absolute before:-start-4 before:top-4 before:h-px before:w-4 before:bg-slate-300 dark:before:bg-slate-600"
            role="treeitem"
            [attr.aria-label]="child.label"
          >
            <app-relation-tree [node]="child" [command]="command()" [depth]="depth() + 1" />
          </li>
        }
      </ul>
    }
  `,
})
export class RelationTree {
  readonly node = input.required<TreeNode>();
  /** Expandir/contraer todo desde fuera. */
  readonly command = input<TreeCommand | null>(null);
  readonly depth = input(0);
  protected readonly collapsed = signal(false);

  constructor() {
    // "Contraer todo" deja visibles el servicio y sus operaciones.
    effect(() => {
      const command = this.command();
      if (command) {
        this.collapsed.set(command.collapse && this.depth() >= 1);
      }
    });
  }

  protected kindClass(kind: string): string {
    return KIND_CLASSES[kind] ?? '';
  }
}
