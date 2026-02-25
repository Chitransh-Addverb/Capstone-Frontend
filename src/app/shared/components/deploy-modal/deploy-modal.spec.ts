import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeployModal } from './deploy-modal';

describe('DeployModal', () => {
  let component: DeployModal;
  let fixture: ComponentFixture<DeployModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeployModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeployModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
