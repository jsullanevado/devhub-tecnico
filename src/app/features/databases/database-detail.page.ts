import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { DatabasesService } from '../../core/data/databases.service';
import {
  DatabaseConnection,
  databaseEngineLabel,
  databaseEnvironmentLabel,
  databaseObjectKey,
  databaseObjectTypeLabel,
  databaseObjectTypeShort,
  DatabaseObjectUsage,
} from '../../core/models';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FavoriteButton } from '../../shared/favorites/favorite-button';
import { Markdown } from '../../shared/markdown/markdown';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourceDeletion } from '../../shared/resources/resource-deletion';
import { ResourceMeta } from '../../shared/resources/resource-meta';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { connectionTarget, environmentBadgeClass } from './databases.codec';
import { sqlplusConnectString } from './lib/connection-parser';

/** Mismo objeto sin distinguir mayúsculas; "PKG_X" coincide con "ESQUEMA.PKG_X". */
function sameObject(reference: string, key: string): boolean {
  const ref = reference.trim().toUpperCase();
  const full = key.toUpperCase();
  return ref === full || full.endsWith('.' + ref) || ref.endsWith('.' + full);
}

@Component({
  selector: 'app-database-detail-page',
  imports: [
    RouterLink,
    LoadState,
    PageHeader,
    ResourceMeta,
    FavoriteButton,
    CopyButton,
    Markdown,
    CodeEditor,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl">
      <app-load-state [state]="loader.state()" backLink="/databases">
        @if (loader.value(); as database) {
          <app-page-header
            [title]="database.title"
            backLink="/databases"
            backLabel="Bases de datos"
          >
            <app-favorite-button
              type="database"
              [resourceId]="database.id"
              [resourceTitle]="database.title"
            />
            @if (permissions.canEdit(database)) {
              <a [routerLink]="['/databases', database.id, 'edit']" class="btn btn-secondary">
                <app-icon name="pencil" iconClass="size-4" /> Editar
              </a>
            }
            @if (permissions.canDelete(database)) {
              <button
                type="button"
                class="btn btn-danger"
                [disabled]="deleting()"
                (click)="remove(database)"
              >
                <app-icon name="trash" iconClass="size-4" /> Eliminar
              </button>
            }
          </app-page-header>

          <app-resource-meta class="mt-4" [resource]="database" tagLink="/databases">
            <span class="badge">{{ engineLabel(database.engine) }}</span>
            <span class="badge" [class]="environmentClass(database.environment)">{{
              environmentLabel(database.environment)
            }}</span>
          </app-resource-meta>

          @if (database.description) {
            <p class="mt-4 whitespace-pre-line text-slate-700 dark:text-slate-300">
              {{ database.description }}
            </p>
          }

          <div class="mt-6 grid gap-6 lg:grid-cols-2">
            <section class="card p-5" aria-labelledby="server-title">
              <h2 id="server-title" class="flex items-center gap-2 font-semibold">
                <app-icon name="database" iconClass="size-5 text-indigo-600 dark:text-indigo-400" />
                Servidor
              </h2>
              <dl class="mt-3 space-y-3 text-sm">
                @if (database.host) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">Host</dt>
                    <dd class="mt-0.5 flex items-center gap-2">
                      <code class="min-w-0 flex-1 truncate font-mono">{{ database.host }}</code>
                      <app-copy-button
                        [text]="database.host"
                        label="Copiar host"
                        [compact]="true"
                      />
                    </dd>
                  </div>
                }
                @if (database.port) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">Puerto</dt>
                    <dd class="mt-0.5 font-mono">{{ database.port }}</dd>
                  </div>
                }
                @if (database.service_name) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">
                      Servicio / SID / base de datos
                    </dt>
                    <dd class="mt-0.5 flex items-center gap-2">
                      <code class="min-w-0 flex-1 truncate font-mono">{{
                        database.service_name
                      }}</code>
                      <app-copy-button
                        [text]="database.service_name"
                        label="Copiar servicio"
                        [compact]="true"
                      />
                    </dd>
                  </div>
                }
                @if (target(database); as target) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">host:puerto/servicio</dt>
                    <dd class="mt-0.5 flex items-center gap-2">
                      <code class="min-w-0 flex-1 truncate font-mono">{{ target }}</code>
                      <app-copy-button [text]="target" label="Copiar destino" [compact]="true" />
                    </dd>
                  </div>
                }
              </dl>
            </section>

            <section class="card p-5" aria-labelledby="credentials-title">
              <h2 id="credentials-title" class="flex items-center gap-2 font-semibold">
                <app-icon name="key" iconClass="size-5 text-indigo-600 dark:text-indigo-400" />
                Credenciales
              </h2>
              @if (!database.username && !database.password) {
                <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Sin usuario ni contraseña registrados.
                </p>
              }
              <dl class="mt-3 space-y-3 text-sm">
                @if (database.username) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">Usuario</dt>
                    <dd class="mt-0.5 flex items-center gap-2">
                      <code class="min-w-0 flex-1 truncate font-mono">{{ database.username }}</code>
                      <app-copy-button
                        [text]="database.username"
                        label="Copiar usuario"
                        [compact]="true"
                      />
                    </dd>
                  </div>
                }
                @if (database.password) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">Contraseña</dt>
                    <dd class="mt-0.5 flex items-center gap-2">
                      <code class="min-w-0 flex-1 truncate font-mono">{{
                        showPassword() ? database.password : '••••••••••••'
                      }}</code>
                      <button
                        type="button"
                        class="btn-icon"
                        [attr.aria-label]="
                          showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'
                        "
                        [attr.aria-pressed]="showPassword()"
                        (click)="showPassword.set(!showPassword())"
                      >
                        <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" iconClass="size-4" />
                      </button>
                      <app-copy-button
                        [text]="database.password"
                        label="Copiar contraseña"
                        [compact]="true"
                      />
                    </dd>
                  </div>
                }
                @if (database.engine === 'oracle' && sqlplus(database); as login) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">SQL*Plus / SQLcl</dt>
                    <dd class="mt-0.5">
                      <app-copy-button [text]="login" label="Copiar usuario/clave@destino" />
                    </dd>
                  </div>
                }
              </dl>
            </section>
          </div>

          @if (database.connection_string) {
            <section class="card mt-6 p-5" aria-labelledby="connection-title">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 id="connection-title" class="flex items-center gap-2 font-semibold">
                  <app-icon name="link" iconClass="size-5 text-indigo-600 dark:text-indigo-400" />
                  Cadena de conexión
                </h2>
                <app-copy-button [text]="database.connection_string" label="Copiar cadena" />
              </div>
              <pre
                class="mt-3 overflow-x-auto rounded-md bg-slate-100 p-3 font-mono text-sm dark:bg-slate-800"
              ><code>{{ database.connection_string }}</code></pre>
            </section>
          }

          @if (database.objects.length || usages().length) {
            <section class="mt-6" aria-labelledby="objects-title">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 id="objects-title" class="font-semibold">
                  Objetos ({{ database.objects.length }})
                </h2>
                @if (database.objects.length > 3) {
                  <input
                    type="search"
                    class="input w-full sm:w-72"
                    placeholder="Buscar objeto o SP…"
                    aria-label="Buscar objeto o SP"
                    [value]="objectQuery()"
                    (input)="objectQuery.set($any($event.target).value)"
                  />
                }
              </div>
              <div class="mt-3 space-y-3">
                @for (object of visibleObjects(); track object.key) {
                  <details
                    class="card group overflow-hidden"
                    (toggle)="toggleObject(object.key, $any($event.target).open)"
                  >
                    <summary
                      class="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <span class="badge font-mono" [title]="typeLabel(object.type)">{{
                        typeShort(object.type)
                      }}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-mono font-medium">{{ object.key }}</span>
                        @if (object.description) {
                          <span class="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {{ object.description }}
                          </span>
                        }
                      </span>
                      @if (object.members?.length) {
                        <span class="text-xs text-slate-500 dark:text-slate-400"
                          >{{ object.members?.length }} SP/FN</span
                        >
                      }
                      @if (object.usages.length) {
                        <span
                          class="badge bg-indigo-50 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300"
                          >{{ object.usages.length }}
                          {{ object.usages.length === 1 ? 'operación' : 'operaciones' }}</span
                        >
                      }
                      <app-icon
                        name="chevron-down"
                        iconClass="size-4 transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div class="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
                      <div class="flex items-center gap-2">
                        <code class="min-w-0 flex-1 truncate font-mono text-sm">{{
                          object.key
                        }}</code>
                        <app-copy-button
                          [text]="object.key"
                          label="Copiar nombre"
                          [compact]="true"
                        />
                      </div>
                      @if (object.members?.length) {
                        <div>
                          <h3 class="text-sm font-medium">Procedimientos y funciones</h3>
                          <ul class="mt-2 space-y-1 text-sm">
                            @for (member of object.members; track member) {
                              <li class="flex flex-wrap items-center gap-2">
                                <code class="font-mono">{{ member }}</code>
                                @for (usage of memberUsages(object.usages, member); track $index) {
                                  <a class="link text-xs" [routerLink]="['/services', usage.id]"
                                    >← {{ usage.title }} · {{ usage.operation }}</a
                                  >
                                }
                              </li>
                            }
                          </ul>
                        </div>
                      }
                      @if (object.usages.length) {
                        <div>
                          <h3 class="text-sm font-medium">Lo usan</h3>
                          <ul class="mt-2 space-y-1 text-sm" data-testid="object-usages">
                            @for (usage of object.usages; track $index) {
                              <li>
                                <a class="link" [routerLink]="['/services', usage.id]">{{
                                  usage.title
                                }}</a>
                                · {{ usage.operation }}
                                @if (usage.member) {
                                  <span class="text-slate-500 dark:text-slate-400">
                                    → <code class="font-mono">{{ usage.member }}</code></span
                                  >
                                }
                              </li>
                            }
                          </ul>
                        </div>
                      }
                      @if (object.code && openObjects().has(object.key)) {
                        <app-code-editor
                          [value]="object.code"
                          language="sql"
                          [readonly]="true"
                          [ariaLabel]="'Código de ' + object.key"
                        />
                      }
                    </div>
                  </details>
                } @empty {
                  @if (database.objects.length) {
                    <p class="text-sm text-slate-500 dark:text-slate-400">
                      Ningún objeto coincide con la búsqueda.
                    </p>
                  }
                }
              </div>
              @if (orphanUsages().length) {
                <div class="card mt-3 p-4 text-sm">
                  <h3 class="font-medium">Usados por servicios pero no registrados aquí</h3>
                  <ul class="mt-2 space-y-1">
                    @for (usage of orphanUsages(); track $index) {
                      <li>
                        <code class="font-mono">{{ usage.object }}</code>
                        {{ usage.member ? '· ' + usage.member : '' }} ←
                        <a class="link" [routerLink]="['/services', usage.id]">{{ usage.title }}</a>
                        · {{ usage.operation }}
                      </li>
                    }
                  </ul>
                </div>
              }
            </section>
          }

          @if (database.notes) {
            <section class="card mt-6 p-5" aria-labelledby="notes-title">
              <h2 id="notes-title" class="font-semibold">Notas</h2>
              <app-markdown class="mt-3" [content]="database.notes" />
            </section>
          }
        }
      </app-load-state>
    </div>
  `,
})
export class DatabaseDetailPage {
  readonly id = input.required<string>();

  private readonly databases = inject(DatabasesService);
  private readonly deletion = inject(ResourceDeletion);
  protected readonly permissions = inject(ResourcePermissions);

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.databases.getById(id),
  );
  private readonly usedByLoader = createAsyncLoader(
    () => this.id(),
    (id) => this.databases.usedBy(id),
  );
  /** Operaciones de servicios que usan objetos de esta conexión. */
  protected readonly usages = computed(() => this.usedByLoader.value() ?? []);
  protected readonly objectQuery = signal('');
  /** Objetos abiertos: el código solo se pinta al abrirlos. */
  protected readonly openObjects = signal<ReadonlySet<string>>(new Set());

  /** Objetos con su clave ESQUEMA.NOMBRE y las operaciones que los usan, filtrados. */
  protected readonly visibleObjects = computed(() => {
    const usages = this.usages();
    const query = this.objectQuery().trim().toUpperCase();
    return (this.loader.value()?.objects ?? [])
      .map((object) => {
        const key = databaseObjectKey(object);
        return { ...object, key, usages: usages.filter((usage) => sameObject(usage.object, key)) };
      })
      .filter(
        (object) =>
          !query ||
          object.key.toUpperCase().includes(query) ||
          (object.description ?? '').toUpperCase().includes(query) ||
          (object.members ?? []).some((member) => member.toUpperCase().includes(query)),
      );
  });
  /** Referencias de servicios a objetos que no están en la lista de esta conexión. */
  protected readonly orphanUsages = computed(() => {
    const keys = (this.loader.value()?.objects ?? []).map(databaseObjectKey);
    return this.usages().filter((usage) => !keys.some((key) => sameObject(usage.object, key)));
  });
  protected readonly typeShort = databaseObjectTypeShort;
  protected readonly typeLabel = databaseObjectTypeLabel;
  protected readonly deleting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly engineLabel = databaseEngineLabel;
  protected readonly environmentLabel = databaseEnvironmentLabel;
  protected readonly environmentClass = environmentBadgeClass;
  protected readonly target = connectionTarget;
  protected readonly sqlplus = sqlplusConnectString;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const database = this.loader.value();
      if (database) {
        title.setTitle(`${database.title} · ${environment.appName}`);
      }
    });
  }

  protected toggleObject(key: string, open: boolean): void {
    this.openObjects.update((current) => {
      const next = new Set(current);
      if (open) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  protected memberUsages(usages: DatabaseObjectUsage[], member: string): DatabaseObjectUsage[] {
    return usages.filter((usage) => usage.member?.toUpperCase() === member.toUpperCase());
  }

  protected async remove(database: DatabaseConnection): Promise<void> {
    this.deleting.set(true);
    await this.deletion.run({
      dialogTitle: 'Eliminar conexión',
      resourceTitle: database.title,
      successMessage: 'Conexión eliminada.',
      remove: () => this.databases.delete(database.id),
      redirectTo: '/databases',
    });
    this.deleting.set(false);
  }
}
