import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ServicesService } from '../../core/data/services.service';
import { toAppError } from '../../core/errors/error-mapper';
import {
  Service,
  ServiceOperation,
  bodyLanguage,
  buildCurl,
  operationUrl,
  serviceAuthTypeLabel,
  serviceProtocolLabel,
} from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FavoriteButton } from '../../shared/favorites/favorite-button';
import { Markdown } from '../../shared/markdown/markdown';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourceDeletion } from '../../shared/resources/resource-deletion';
import { ResourceMeta } from '../../shared/resources/resource-meta';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Alert } from '../../shared/ui/alert/alert';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { openDownloadUrl } from '../../shared/utils/file-utils';
import { formatBytes } from '../../shared/utils/format';
import { methodBadgeClass } from './service-ui';

@Component({
  selector: 'app-service-detail-page',
  imports: [
    RouterLink,
    LoadState,
    PageHeader,
    ResourceMeta,
    FavoriteButton,
    CodeEditor,
    CopyButton,
    Markdown,
    Alert,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl">
      <app-load-state [state]="loader.state()" backLink="/services">
        @if (loader.value(); as service) {
          <app-page-header [title]="service.title" backLink="/services" backLabel="Servicios">
            <app-favorite-button
              type="service"
              [resourceId]="service.id"
              [resourceTitle]="service.title"
            />
            @if (service.soapui_file_path) {
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="downloading()"
                (click)="downloadSoapUi(service)"
              >
                <app-icon name="download" iconClass="size-4" /> Proyecto SoapUI
              </button>
            }
            @if (permissions.canEdit(service)) {
              <a [routerLink]="['/services', service.id, 'edit']" class="btn btn-secondary">
                <app-icon name="pencil" iconClass="size-4" /> Editar
              </a>
            }
            @if (permissions.canDelete(service)) {
              <button
                type="button"
                class="btn btn-danger"
                [disabled]="deleting()"
                (click)="remove(service)"
              >
                <app-icon name="trash" iconClass="size-4" /> Eliminar
              </button>
            }
          </app-page-header>

          <app-resource-meta class="mt-4" [resource]="service" tagLink="/services">
            <span class="badge">{{ protocolLabel(service.protocol) }}</span>
            @if (service.system) {
              <span class="badge">{{ service.system }}</span>
            }
          </app-resource-meta>

          @if (service.description) {
            <p class="mt-4 whitespace-pre-line text-slate-700 dark:text-slate-300">
              {{ service.description }}
            </p>
          }

          <div class="mt-6 grid gap-6 lg:grid-cols-2">
            <section class="card p-5" aria-labelledby="connection-title">
              <h2 id="connection-title" class="flex items-center gap-2 font-semibold">
                <app-icon name="link" iconClass="size-5 text-indigo-600 dark:text-indigo-400" />
                Conexión
              </h2>
              <dl class="mt-3 space-y-3 text-sm">
                <div>
                  <dt class="text-slate-500 dark:text-slate-400">URL base</dt>
                  <dd class="mt-0.5 flex items-center gap-2">
                    <code class="min-w-0 flex-1 truncate font-mono">{{ service.base_url }}</code>
                    <app-copy-button
                      [text]="service.base_url"
                      label="Copiar URL base"
                      [compact]="true"
                    />
                  </dd>
                </div>
                @if (service.wsdl_url) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">WSDL</dt>
                    <dd class="mt-0.5 flex items-center gap-2">
                      <code class="min-w-0 flex-1 truncate font-mono">{{ service.wsdl_url }}</code>
                      <app-copy-button
                        [text]="service.wsdl_url"
                        label="Copiar WSDL"
                        [compact]="true"
                      />
                    </dd>
                  </div>
                }
                @if (service.datapower_domain || service.datapower_object) {
                  <div>
                    <dt class="text-slate-500 dark:text-slate-400">DataPower</dt>
                    <dd class="mt-0.5">
                      @if (service.datapower_domain) {
                        Dominio <code class="font-mono">{{ service.datapower_domain }}</code>
                      }
                      @if (service.datapower_object) {
                        · Servicio <code class="font-mono">{{ service.datapower_object }}</code>
                      }
                    </dd>
                  </div>
                }
              </dl>
            </section>

            <section class="card p-5" aria-labelledby="auth-title">
              <h2 id="auth-title" class="flex items-center gap-2 font-semibold">
                <app-icon name="key" iconClass="size-5 text-indigo-600 dark:text-indigo-400" />
                Autenticación
              </h2>
              <p class="mt-3 text-sm">{{ authLabel(service.auth_type) }}</p>
              @if (service.auth_type !== 'none') {
                <dl class="mt-3 space-y-3 text-sm">
                  @if (service.auth_username) {
                    <div>
                      <dt class="text-slate-500 dark:text-slate-400">
                        {{ service.auth_type === 'api_key' ? 'Header' : 'Usuario' }}
                      </dt>
                      <dd class="mt-0.5 flex items-center gap-2">
                        <code class="min-w-0 flex-1 truncate font-mono">{{
                          service.auth_username
                        }}</code>
                        <app-copy-button
                          [text]="service.auth_username"
                          label="Copiar usuario"
                          [compact]="true"
                        />
                      </dd>
                    </div>
                  }
                  @if (service.auth_secret) {
                    <div>
                      <dt class="text-slate-500 dark:text-slate-400">
                        {{ service.auth_type === 'basic' ? 'Contraseña' : 'Token / clave' }}
                      </dt>
                      <dd class="mt-0.5 flex items-center gap-2">
                        <code class="min-w-0 flex-1 truncate font-mono">{{
                          showSecret() ? service.auth_secret : '••••••••••••'
                        }}</code>
                        <button
                          type="button"
                          class="btn-icon"
                          [attr.aria-label]="showSecret() ? 'Ocultar secreto' : 'Mostrar secreto'"
                          [attr.aria-pressed]="showSecret()"
                          (click)="showSecret.set(!showSecret())"
                        >
                          <app-icon [name]="showSecret() ? 'eye-off' : 'eye'" iconClass="size-4" />
                        </button>
                        <app-copy-button
                          [text]="service.auth_secret"
                          label="Copiar secreto"
                          [compact]="true"
                        />
                      </dd>
                    </div>
                  }
                  @if (service.auth_notes) {
                    <div>
                      <dt class="text-slate-500 dark:text-slate-400">Notas</dt>
                      <dd class="mt-0.5 whitespace-pre-line">{{ service.auth_notes }}</dd>
                    </div>
                  }
                </dl>
                @if (service.visibility === 'public' && service.auth_secret) {
                  <p class="mt-3 text-xs text-amber-700 dark:text-amber-300">
                    Servicio público: todo el equipo puede ver estas credenciales.
                  </p>
                }
              }
            </section>
          </div>

          @if (service.notes) {
            <section class="card mt-6 p-5" aria-labelledby="notes-title">
              <h2 id="notes-title" class="font-semibold">Notas</h2>
              <app-markdown class="mt-3" [content]="service.notes" />
            </section>
          }

          <section class="mt-8" aria-labelledby="operations-title">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 id="operations-title" class="text-lg font-semibold">
                Operaciones ({{ service.operations.length }})
              </h2>
              @if (hasCredentials(service)) {
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="size-4 accent-indigo-600"
                    [checked]="curlWithCredentials()"
                    (change)="curlWithCredentials.set(!curlWithCredentials())"
                  />
                  Incluir credenciales en cURL
                </label>
              }
            </div>

            @if (service.operations.length === 0) {
              <app-alert type="info" class="mt-4">
                Este servicio aún no tiene operaciones documentadas.
              </app-alert>
            }

            <div class="mt-4 space-y-4">
              @for (operation of service.operations; track $index; let first = $first) {
                <details class="card group overflow-hidden" [open]="first">
                  <summary
                    class="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-slate-800/50"
                  >
                    <span class="badge font-mono" [class]="methodClass(operation.method)">{{
                      operation.method
                    }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{{ operation.name }}</span>
                      <span
                        class="block truncate font-mono text-xs text-slate-500 dark:text-slate-400"
                      >
                        {{ operation.soap_action || operation.path || service.base_url }}
                      </span>
                    </span>
                    @if (operation.response_status) {
                      <span class="badge tabular-nums">{{ operation.response_status }}</span>
                    }
                    <app-icon
                      name="chevron-down"
                      iconClass="size-4 text-slate-400 transition group-open:rotate-180"
                    />
                  </summary>

                  <div class="space-y-5 border-t border-slate-200 p-4 dark:border-slate-800">
                    <div class="flex flex-wrap items-center gap-2">
                      <code
                        class="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 font-mono text-sm dark:bg-slate-800"
                        >{{ url(service, operation) }}</code
                      >
                      <app-copy-button [text]="url(service, operation)" label="Copiar URL" />
                      <app-copy-button [text]="curl(service, operation)" label="Copiar cURL" />
                    </div>

                    @if (operation.soap_action) {
                      <p class="text-sm">
                        <span class="text-slate-500 dark:text-slate-400">SOAPAction:</span>
                        <code class="font-mono">{{ operation.soap_action }}</code>
                      </p>
                    }

                    @if (operation.headers?.length) {
                      <div>
                        <h3 class="text-sm font-medium">Headers</h3>
                        <table class="mt-2 w-full table-fixed text-sm">
                          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                            @for (header of operation.headers; track $index) {
                              <tr>
                                <th
                                  scope="row"
                                  class="w-1/3 truncate py-1.5 pe-3 text-start font-mono font-normal text-slate-500 dark:text-slate-400"
                                >
                                  {{ header.name }}
                                </th>
                                <td class="truncate py-1.5 font-mono">{{ header.value }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }

                    @if (operation.query_params?.length) {
                      <div>
                        <h3 class="text-sm font-medium">Query params</h3>
                        <table class="mt-2 w-full table-fixed text-sm">
                          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                            @for (param of operation.query_params; track $index) {
                              <tr>
                                <th
                                  scope="row"
                                  class="w-1/3 truncate py-1.5 pe-3 text-start font-mono font-normal text-slate-500 dark:text-slate-400"
                                >
                                  {{ param.name }}
                                </th>
                                <td class="truncate py-1.5 font-mono">{{ param.value }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }

                    <div class="grid gap-4 xl:grid-cols-2">
                      <div>
                        <div class="flex items-center justify-between gap-2">
                          <h3 class="text-sm font-medium">Request</h3>
                          @if (operation.request_body) {
                            <app-copy-button
                              [text]="operation.request_body"
                              label="Copiar request"
                              [compact]="true"
                            />
                          }
                        </div>
                        @if (operation.request_body) {
                          <app-code-editor
                            class="mt-2"
                            [value]="operation.request_body"
                            [language]="language(operation, service)"
                            [readonly]="true"
                            [ariaLabel]="'Request de ' + operation.name"
                          />
                        } @else {
                          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin body.</p>
                        }
                      </div>
                      <div>
                        <div class="flex items-center justify-between gap-2">
                          <h3 class="text-sm font-medium">
                            Response
                            @if (operation.response_status) {
                              <span class="text-slate-500 dark:text-slate-400"
                                >({{ operation.response_status }})</span
                              >
                            }
                          </h3>
                          @if (operation.response_body) {
                            <app-copy-button
                              [text]="operation.response_body"
                              label="Copiar response"
                              [compact]="true"
                            />
                          }
                        </div>
                        @if (operation.response_body) {
                          <app-code-editor
                            class="mt-2"
                            [value]="operation.response_body"
                            [language]="bodyLang(operation.response_body, operation, service)"
                            [readonly]="true"
                            [ariaLabel]="'Response de ' + operation.name"
                          />
                        } @else {
                          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Sin ejemplo.
                          </p>
                        }
                      </div>
                    </div>

                    @if (operation.notes) {
                      <p class="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                        {{ operation.notes }}
                      </p>
                    }
                  </div>
                </details>
              }
            </div>
          </section>

          @if (service.soapui_file_name) {
            <p class="mt-6 text-sm text-slate-500 dark:text-slate-400">
              Proyecto SoapUI: {{ service.soapui_file_name }} ({{
                size(service.soapui_file_size ?? 0)
              }})
            </p>
          }
        }
      </app-load-state>
    </div>
  `,
})
export class ServiceDetailPage {
  readonly id = input.required<string>();

  private readonly services = inject(ServicesService);
  private readonly deletion = inject(ResourceDeletion);
  private readonly notifications = inject(NotificationService);
  protected readonly permissions = inject(ResourcePermissions);

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.services.getById(id),
  );
  protected readonly deleting = signal(false);
  protected readonly downloading = signal(false);
  protected readonly showSecret = signal(false);
  protected readonly curlWithCredentials = signal(false);
  protected readonly protocolLabel = serviceProtocolLabel;
  protected readonly authLabel = serviceAuthTypeLabel;
  protected readonly methodClass = methodBadgeClass;
  protected readonly size = formatBytes;
  protected readonly url = (service: Service, operation: ServiceOperation) =>
    operationUrl(service.base_url, operation);

  constructor() {
    const title = inject(Title);
    effect(() => {
      const service = this.loader.value();
      if (service) {
        title.setTitle(`${service.title} · ${environment.appName}`);
      }
    });
  }

  protected hasCredentials(service: Service): boolean {
    return service.auth_type !== 'none' && !!(service.auth_username || service.auth_secret);
  }

  protected curl(service: Service, operation: ServiceOperation): string {
    return buildCurl(service, operation, { includeCredentials: this.curlWithCredentials() });
  }

  protected language(operation: ServiceOperation, service: Service): string {
    return bodyLanguage(operation.media_type, service.protocol);
  }

  /** La response puede venir en otro formato que el request: se deduce del contenido. */
  protected bodyLang(body: string, operation: ServiceOperation, service: Service): string {
    const first = body.trimStart()[0];
    return first === '{' || first === '['
      ? 'json'
      : first === '<'
        ? 'xml'
        : this.language(operation, service);
  }

  protected async downloadSoapUi(service: Service): Promise<void> {
    this.downloading.set(true);
    try {
      openDownloadUrl(await this.services.soapUiDownloadUrl(service));
    } catch (error) {
      this.notifications.error(toAppError(error).message);
    } finally {
      this.downloading.set(false);
    }
  }

  protected async remove(service: Service): Promise<void> {
    this.deleting.set(true);
    await this.deletion.run({
      dialogTitle: 'Eliminar servicio',
      resourceTitle: service.title,
      successMessage: 'Servicio eliminado.',
      remove: () => this.services.delete(service.id),
      redirectTo: '/services',
    });
    this.deleting.set(false);
  }
}
