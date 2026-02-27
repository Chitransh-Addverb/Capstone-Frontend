import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../theme/theme.service';
import { NotificationPanel } from '../../../shared/components/notification-panel/notification-panel';

@Component({
  selector: 'app-topbar',
  imports: [CommonModule, NotificationPanel],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {

  themeService = inject(ThemeService);

}




