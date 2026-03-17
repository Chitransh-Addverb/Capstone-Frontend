import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  WorkflowDefinitionService,
  WorkflowDefinition,
} from '../../core/services/workflow-definition.service';
import { WorkflowApiService } from '../../core/api/workflow-api.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkflowDetailModal } from '../../shared/components/workflow-detail-modal/workflow-detail-modal';
import { Pagination } from '../../shared/components/pagination/pagination';

type StatusFilter = 'all' | 'active' | 'inactive';
type SortOption   = 'updated' | 'name' | 'version';

const PAGE_SIZE = 8;

@Component({
  selector: 'app-workflow-definitions',
  standalone: true,
  imports: [CommonModule, FormsModule, WorkflowDetailModal, Pagination],
  templateUrl: './workflow-definitions.html',
  styleUrl: './workflow-definitions.scss',
})
export class WorkflowDefinitionsComponent implements OnInit {

  private service     = inject(WorkflowDefinitionService);
  private workflowApi = inject(WorkflowApiService);
  private router      = inject(Router);
  private toast       = inject(ToastService);

  readonly PAGE_SIZE = PAGE_SIZE;

  /* ── Page state ─────────────────────────────────────────── */
  pageLoading  = signal(true);
  pageError    = signal<string | null>(null);

  /* ── Search / filter / sort ─────────────────────────────── */
  searchQuery  = signal('');
  statusFilter = signal<StatusFilter>('all');
  sortBy       = signal<SortOption>('updated');

  /* ── Pagination ─────────────────────────────────────────── */
  currentPage  = signal(1);

  /* ── Row-level loading ──────────────────────────────────── */
  togglingKey  = signal<string | null>(null);
  deletingKey  = signal<string | null>(null);

  /* ── Expand state ───────────────────────────────────────── */
  expandedKey  = signal<string | null>(null);
  loadedKeys   = signal<Set<string>>(new Set());

  /* ── 3-dot dropdown ─────────────────────────────────────── */
  openMenuKey  = signal<string | null>(null);

  // ── ADDED: fixed-position coordinates for the dropdown ───
  menuTop  = 0;
  menuLeft = 0;

  /* ── Modals ─────────────────────────────────────────────── */
  showDetailModal      = signal(false);
  selectedDefinition   = signal<WorkflowDefinition | null>(null);
  confirmDeleteTarget  = signal<{ key: string; version: number } | null>(null);

  /* ── Derived ─────────────────────────────────────────────── */
  allDefinitions = computed(() => this.service.definitions());
  totalWorkflows = computed(() => this.service.latestVersions().length);
  activeCount    = computed(() =>
    this.service.latestVersions().filter(d => d.status === 'active').length);
  totalVersions  = computed(() => this.service.definitions().length);

  existingWorkflowKeys = computed(() =>
    new Set(this.service.latestVersions().map(d => d.workflow_key.toLowerCase()))
  );

  filteredRows = computed((): WorkflowDefinition[] => {
    const q      = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const sort   = this.sortBy();

    let pool = this.service.latestVersions();

    if (q) {
      pool = pool.filter(d =>
        d.workflow_key.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q),
      );
    }
    if (status !== 'all') {
      pool = pool.filter(d => d.status === status);
    }
    pool = [...pool].sort((a, b) => {
      if (sort === 'updated') return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (sort === 'name')    return a.workflow_key.localeCompare(b.workflow_key);
      if (sort === 'version') return b.version - a.version;
      return 0;
    });

    return pool;
  });

  displayRows = computed((): { rows: WorkflowDefinition[]; isSearchMode: boolean } => ({
    rows: this.pagedRows(),
    isSearchMode: !!this.searchQuery().trim(),
  }));

  pagedRows = computed((): WorkflowDefinition[] => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

  totalFiltered = computed(() => this.filteredRows().length);

  hasActiveFilters = computed(() =>
    this.searchQuery() !== '' ||
    this.statusFilter() !== 'all' ||
    this.sortBy() !== 'updated',
  );

  /* ── Global click → close menu ──────────────────────────── */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.openMenuKey.set(null);
  }

  /* ── Lifecycle ──────────────────────────────────────────── */
  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.pageLoading.set(true);
    this.pageError.set(null);
    this.service.loadAll().subscribe({
      next:  () => this.pageLoading.set(false),
      error: (err) => {
        this.pageError.set(err?.message || 'Failed to load workflows.');
        this.pageLoading.set(false);
      },
    });
  }

  /* ── Pagination ─────────────────────────────────────────── */
  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.expandedKey.set(null);
  }

  /* ── Version expand ─────────────────────────────────────── */
  toggleVersions(key: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedKey() === key) {
      this.expandedKey.set(null);
      return;
    }
    this.expandedKey.set(key);
    if (!this.loadedKeys().has(key)) {
      this.service.loadVersionsForKey(key).subscribe({
        next:  () => this.loadedKeys.update(s => new Set([...s, key])),
        error: () => this.toast.error('Failed to load versions', key),
      });
    }
  }

  isExpanded(key: string): boolean {
    return this.expandedKey() === key;
  }

  getVersionsForKey(key: string): WorkflowDefinition[] {
    return this.service.getByKey(key);
  }

  /* ── Search / filter ─────────────────────────────────────── */
  setSearch(value: string): void {
    this.searchQuery.set(value);
    this.currentPage.set(1);
    this.expandedKey.set(null);
  }

  setStatus(s: StatusFilter): void {
    this.statusFilter.set(s);
    this.currentPage.set(1);
  }

  setSort(s: SortOption): void {
    this.sortBy.set(s);
    this.currentPage.set(1);
  }

  clearAll(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.sortBy.set('updated');
    this.currentPage.set(1);
  }

  /* ── 3-dot menu ─────────────────────────────────────────── */
  menuKey(key: string, version: number): string { return `${key}@${version}`; }

  // ── CHANGED: was a simple toggle; now also computes fixed position ──
  toggleMenu(key: string, version: number, event: MouseEvent): void {
    event.stopPropagation();

    const k           = this.menuKey(key, version);
    const alreadyOpen = this.openMenuKey() === k;

    // Always close first
    this.openMenuKey.set(null);

    if (alreadyOpen) return; // clicked same button → just close

    // Compute fixed-position coordinates from the trigger button's rect
    const btn  = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();

    const MENU_WIDTH  = 180;  // must match min-width in SCSS
    const MENU_HEIGHT = 160;  // approximate menu height

    // Open below by default; flip above if not enough room below
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove  = spaceBelow < MENU_HEIGHT && rect.top > MENU_HEIGHT;

    this.menuTop  = openAbove ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4;
    this.menuLeft = rect.right - MENU_WIDTH;

    // Clamp: never let it overflow off the left edge
    if (this.menuLeft < 8) this.menuLeft = 8;

    this.openMenuKey.set(k);
  }

  closeMenu(): void { this.openMenuKey.set(null); }

  isMenuOpen(key: string, version: number): boolean {
    return this.openMenuKey() === this.menuKey(key, version);
  }

  /* ── Navigation ─────────────────────────────────────────── */
  goToDesigner(): void { this.router.navigate(['/designer']); }

  editWorkflow(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    this.router.navigate(['/designer'], {
      queryParams: { key: def.workflow_key, version: def.version },
    });
  }

  /* ── Detail modal ───────────────────────────────────────── */
  openDetail(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    if (!def.bpmn_xml) {
      this.workflowApi.getByKeyAndVersion(def.workflow_key, def.version).subscribe({
        next: (dto) => {
          this.selectedDefinition.set({ ...def, bpmn_xml: dto.bpmn_xml ?? '' });
          this.showDetailModal.set(true);
        },
        error: () => {
          this.selectedDefinition.set(def);
          this.showDetailModal.set(true);
        },
      });
    } else {
      this.selectedDefinition.set(def);
      this.showDetailModal.set(true);
    }
  }

  closeDetail(): void {
    this.showDetailModal.set(false);
    this.selectedDefinition.set(null);
  }

  /* ── Activate / Deactivate ──────────────────────────────── */
  activate(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    const k = this.menuKey(def.workflow_key, def.version);
    if (this.togglingKey()) return;
    this.togglingKey.set(k);
    this.service.activate(def.workflow_key, def.version).subscribe({
      next: () => {
        this.toast.success('Activated', `${def.workflow_key} v${def.version} is now active.`);
        this.togglingKey.set(null);
      },
      error: (err) => {
        this.toast.error('Failed', err?.error?.message || 'Could not reach the backend.');
        this.togglingKey.set(null);
      },
    });
  }

  deactivate(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    const k = this.menuKey(def.workflow_key, def.version);
    if (this.togglingKey()) return;
    this.togglingKey.set(k);
    this.service.deactivate(def.workflow_key, def.version).subscribe({
      next: () => {
        this.toast.success('Paused', `${def.workflow_key} v${def.version} is now inactive.`);
        this.togglingKey.set(null);
      },
      error: (err) => {
        this.toast.error('Failed', err?.error?.message || 'Could not reach the backend.');
        this.togglingKey.set(null);
      },
    });
  }

  isToggling(key: string, version: number): boolean {
    return this.togglingKey() === this.menuKey(key, version);
  }

  /* ── Delete ─────────────────────────────────────────────── */
  confirmDelete(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    this.confirmDeleteTarget.set({ key: def.workflow_key, version: def.version });
  }

  cancelDelete(): void { this.confirmDeleteTarget.set(null); }

  executeDelete(): void {
    const target = this.confirmDeleteTarget();
    if (!target) return;
    this.deletingKey.set(this.menuKey(target.key, target.version));
    this.service.delete(target.key, target.version).subscribe({
      next: () => {
        this.toast.success('Deleted', `${target.key} v${target.version} removed.`);
        this.confirmDeleteTarget.set(null);
        this.deletingKey.set(null);
        if (this.pagedRows().length === 0 && this.currentPage() > 1) {
          this.currentPage.update(p => p - 1);
        }
      },
      error: (err) => {
        this.toast.error('Delete failed', err?.error?.message || 'Backend error.');
        this.confirmDeleteTarget.set(null);
        this.deletingKey.set(null);
      },
    });
  }

  /* ── Helpers ────────────────────────────────────────────── */
  getAvatarLetter(def: WorkflowDefinition): string {
    return (def?.workflow_key ?? '?').charAt(0).toUpperCase();
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(date));
  }

  highlightMatch(text: string, query: string): string {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }
}


