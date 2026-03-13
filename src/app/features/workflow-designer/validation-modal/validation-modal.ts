import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValidationError } from '../validators/bpmn-canvas.validator';

@Component({
  selector: 'app-validation-modal',
  imports: [CommonModule],
  templateUrl: './validation-modal.html',
  styleUrl: './validation-modal.scss',
})
export class ValidationModal {

  @Input() visible = false;
  @Input() errors: ValidationError[] = [];
  @Input() warnings: ValidationError[] = [];

  @Output() close = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

}




