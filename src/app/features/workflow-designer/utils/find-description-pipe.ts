import { Pipe, PipeTransform } from '@angular/core';
import { HANDLER_OPTIONS } from '../properties-panel/properties-panel';

/**
 * Usage: {{ HANDLER_OPTIONS | findDescription: taskHandler() }}
 * Returns the human-readable description for the selected handler value.
 */
@Pipe({ name: 'findDescription', standalone: true })
export class FindDescriptionPipe implements PipeTransform {
  transform(options: readonly any[], handlerValue: string): string {
    const opt = options.find(o => o.value === handlerValue);
    return opt?.description ?? '';
  }
}
