import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  imports: [CommonModule],
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
})
export class Pagination implements OnChanges {

  @Input() currentPage = 1;
  @Input() totalItems  = 0;
  @Input() pageSize    = 8;
  @Output() pageChange = new EventEmitter<number>();

  totalPages = 1;
  pages: number[] = [];
  rangeStart = 0;
  rangeEnd   = 0;

  ngOnChanges(): void {
    this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    this.rangeStart = this.totalItems === 0 ? 0
      : Math.min((this.currentPage - 1) * this.pageSize + 1, this.totalItems);
    this.rangeEnd = Math.min(this.currentPage * this.pageSize, this.totalItems);
    this.pages = this.buildPages();
  }

  go(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.pageChange.emit(page);
  }

  private buildPages(): number[] {
    const total   = this.totalPages;
    const current = this.currentPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const result: number[] = [1];
    const left  = current - 1;
    const right = current + 1;

    if (left > 2)              result.push(-1);
    for (let i = Math.max(2, left); i <= Math.min(total - 1, right); i++) {
      result.push(i);
    }
    if (right < total - 1)     result.push(-1);
    result.push(total);

    return result;
  }

}
