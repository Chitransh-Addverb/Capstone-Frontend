import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidationModal } from './validation-modal';

describe('ValidationModal', () => {
  let component: ValidationModal;
  let fixture: ComponentFixture<ValidationModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidationModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidationModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
