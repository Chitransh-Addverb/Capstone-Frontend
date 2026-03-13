import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScannerConfig } from './scanner-config';

describe('ScannerConfig', () => {
  let component: ScannerConfig;
  let fixture: ComponentFixture<ScannerConfig>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScannerConfig]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScannerConfig);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
