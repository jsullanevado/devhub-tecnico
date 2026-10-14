import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FlowLayout, FlowLayoutNode } from './flows.models';

const LANE_STYLE: Record<string, { fill: string; stroke: string; header: string }> = {
  front: {
    fill: 'fill-white dark:fill-slate-800',
    stroke: 'stroke-slate-400 dark:stroke-slate-500',
    header: 'fill-slate-100 dark:fill-slate-800/60',
  },
  datapower: {
    fill: 'fill-violet-50 dark:fill-violet-500/15',
    stroke: 'stroke-violet-400 dark:stroke-violet-400/70',
    header: 'fill-violet-50/60 dark:fill-violet-500/10',
  },
  servicio: {
    fill: 'fill-indigo-50 dark:fill-indigo-500/15',
    stroke: 'stroke-indigo-400 dark:stroke-indigo-400/70',
    header: 'fill-indigo-50/60 dark:fill-indigo-500/10',
  },
  bd: {
    fill: 'fill-amber-50 dark:fill-amber-500/15',
    stroke: 'stroke-amber-400 dark:stroke-amber-400/70',
    header: 'fill-amber-50/60 dark:fill-amber-500/10',
  },
};

/** Parte un texto en líneas de ~maxChars (máx. maxLines; la última con "…"). */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text
    .replace(/([._·/])/g, '$1​')
    .split(/[\s​]+/)
    .filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current}${/[._·/]$/.test(current) ? '' : ' '}${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`;
    return kept;
  }
  return lines;
}

/**
 * Diagrama BPMN dibujado en SVG a partir de la geometría que genera el backend (la misma
 * del .bpmn que se exporta). Zoom con botones; los subprocesos se pueden abrir.
 */
@Component({
  selector: 'app-flow-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = layout();
    <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <button type="button" class="btn-icon" aria-label="Alejar" (click)="zoomBy(-0.15)">−</button>
      <span class="w-12 text-center tabular-nums">{{ percent() }}%</span>
      <button type="button" class="btn-icon" aria-label="Acercar" (click)="zoomBy(0.15)">+</button>
      <button type="button" class="link" (click)="fit()">Ajustar al ancho</button>
      <button type="button" class="link" (click)="zoom.set(1)">100 %</button>
      <span
        class="ms-auto flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400"
      >
        <span class="flex items-center gap-1"
          ><span class="inline-block h-3 w-4 rounded border border-dashed border-slate-400"></span>
          Completado con DevHub</span
        >
        <span>Pasa el ratón sobre un paso para ver su origen en el código</span>
      </span>
    </div>
    <div
      #scroller
      class="overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      style="max-height: 70vh"
    >
      <svg
        [attr.width]="d.width * zoom()"
        [attr.height]="d.height * zoom()"
        [attr.viewBox]="'0 0 ' + d.width + ' ' + d.height"
        role="img"
        [attr.aria-label]="'Diagrama ' + d.pool.name"
        class="font-sans"
      >
        <defs>
          <marker
            id="flecha"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" class="fill-slate-500 dark:fill-slate-400" />
          </marker>
        </defs>

        <!-- Pool y carriles -->
        <rect
          [attr.x]="d.pool.x"
          [attr.y]="d.pool.y"
          [attr.width]="d.pool.w"
          [attr.height]="d.pool.h"
          class="fill-none stroke-slate-400 dark:stroke-slate-600"
        />
        <text
          [attr.transform]="
            'translate(' +
            (d.pool.x + d.pool.header / 2 + 5) +
            ',' +
            (d.pool.y + d.pool.h / 2) +
            ') rotate(-90)'
          "
          text-anchor="middle"
          class="fill-slate-700 text-[13px] font-semibold dark:fill-slate-200"
        >
          {{ poolLabel() }}
        </text>
        @for (lane of d.lanes; track lane.id) {
          <rect
            [attr.x]="lane.x"
            [attr.y]="lane.y"
            [attr.width]="lane.w"
            [attr.height]="lane.h"
            class="stroke-slate-300 dark:stroke-slate-700"
            [class]="laneStyle(lane.id).header"
          />
          <text
            [attr.transform]="
              'translate(' +
              (lane.x + lane.header / 2 + 5) +
              ',' +
              (lane.y + lane.h / 2) +
              ') rotate(-90)'
            "
            text-anchor="middle"
            class="fill-slate-600 text-[13px] font-semibold dark:fill-slate-300"
          >
            {{ lane.name }}
          </text>
        }

        <!-- Conexiones -->
        @for (edge of d.edges; track edge.id) {
          <polyline
            [attr.points]="pointsOf(edge.points)"
            fill="none"
            marker-end="url(#flecha)"
            class="stroke-slate-500 dark:stroke-slate-400"
            stroke-width="1.5"
          />
          @if (edge.label) {
            <text
              [attr.x]="edge.labelAt[0] + 6"
              [attr.y]="edge.labelAt[1] - 6"
              class="fill-slate-600 text-[11px] dark:fill-slate-300"
            >
              {{ edge.label }}
            </text>
          }
        }

        <!-- Nodos -->
        @for (node of d.nodes; track node.id) {
          <g
            [attr.data-node]="node.type"
            [class.cursor-pointer]="node.type === 'subprocess'"
            (click)="node.type === 'subprocess' && openSubprocess.emit(node.name)"
          >
            <title>
              {{ node.name
              }}{{
                node.doc
                  ? '
' + node.doc
                  : ''
              }}
            </title>
            @switch (node.type) {
              @case ('start') {
                <circle
                  [attr.cx]="node.x + node.w / 2"
                  [attr.cy]="node.y + node.h / 2"
                  [attr.r]="node.w / 2"
                  stroke-width="2"
                  class="fill-emerald-50 stroke-emerald-600 dark:fill-emerald-500/20"
                />
              }
              @case ('end') {
                <circle
                  [attr.cx]="node.x + node.w / 2"
                  [attr.cy]="node.y + node.h / 2"
                  [attr.r]="node.w / 2"
                  stroke-width="4"
                  class="fill-red-50 stroke-red-600 dark:fill-red-500/20"
                />
              }
              @default {
                <rect
                  [attr.x]="node.x"
                  [attr.y]="node.y"
                  [attr.width]="node.w"
                  [attr.height]="node.h"
                  rx="10"
                  stroke-width="1.5"
                  [attr.stroke-dasharray]="node.origin === 'devhub' ? '5 3' : null"
                  [class]="laneStyle(node.lane).fill + ' ' + laneStyle(node.lane).stroke"
                />
                @if (node.type === 'subprocess') {
                  <rect
                    [attr.x]="node.x + node.w / 2 - 7"
                    [attr.y]="node.y + node.h - 15"
                    width="14"
                    height="14"
                    fill="none"
                    class="stroke-slate-600 dark:stroke-slate-300"
                  />
                  <path
                    [attr.d]="
                      'M' +
                      (node.x + node.w / 2 - 4) +
                      ',' +
                      (node.y + node.h - 8) +
                      'h8M' +
                      (node.x + node.w / 2) +
                      ',' +
                      (node.y + node.h - 12) +
                      'v8'
                    "
                    class="stroke-slate-600 dark:stroke-slate-300"
                  />
                }
                @if (node.type === 'service' || node.type === 'script') {
                  <text
                    [attr.x]="node.x + 6"
                    [attr.y]="node.y + 13"
                    class="fill-slate-500 text-[10px] dark:fill-slate-400"
                  >
                    {{ node.type === 'service' ? '⚙' : '⛁' }}
                  </text>
                }
                <text
                  [attr.x]="node.x + node.w / 2"
                  [attr.y]="node.y + node.h / 2 - (linesOf(node).length - 1) * 6.5 + 4"
                  text-anchor="middle"
                  class="fill-slate-800 text-[12px] dark:fill-slate-100"
                >
                  @for (line of linesOf(node); track $index) {
                    <tspan [attr.x]="node.x + node.w / 2" [attr.dy]="$index === 0 ? 0 : 13">
                      {{ line }}
                    </tspan>
                  }
                </text>
              }
            }
            @if (node.type === 'start' || node.type === 'end') {
              <text
                [attr.x]="node.x + node.w / 2"
                [attr.y]="node.y + node.h + 14"
                text-anchor="middle"
                class="fill-slate-600 text-[11px] dark:fill-slate-300"
              >
                @for (line of eventLines(node); track $index) {
                  <tspan [attr.x]="node.x + node.w / 2" [attr.dy]="$index === 0 ? 0 : 13">
                    {{ line }}
                  </tspan>
                }
              </text>
            }
          </g>
        }
      </svg>
    </div>
  `,
})
export class FlowDiagram {
  readonly layout = input.required<FlowLayout>();
  /** Clic en un subproceso: su nombre ("SP01 · …"). */
  readonly openSubprocess = output<string>();

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  protected readonly zoom = signal(0.8);
  protected readonly percent = computed(() => Math.round(this.zoom() * 100));
  protected readonly poolLabel = computed(() => {
    const name = this.layout().pool.name;
    const max = Math.floor(this.layout().pool.h / 7.5);
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
  });

  protected zoomBy(delta: number): void {
    this.zoom.update((value) => Math.min(2, Math.max(0.2, +(value + delta).toFixed(2))));
  }

  protected fit(): void {
    const width = this.scroller().nativeElement.clientWidth - 4;
    this.zoom.set(Math.min(1.5, Math.max(0.2, +(width / this.layout().width).toFixed(2))));
  }

  protected laneStyle(lane: string) {
    return LANE_STYLE[lane] ?? LANE_STYLE['front'];
  }

  protected pointsOf(points: [number, number][]): string {
    return points.map(([x, y]) => `${x},${y}`).join(' ');
  }

  protected linesOf(node: FlowLayoutNode): string[] {
    return wrap(node.name, 19, node.type === 'subprocess' ? 3 : 4);
  }

  protected eventLines(node: FlowLayoutNode): string[] {
    return wrap(node.name, 22, 3);
  }
}
