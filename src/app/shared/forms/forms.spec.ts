import { FormControl, FormGroup, Validators } from '@angular/forms';
import { controlErrorMessage } from './form-errors';
import { matchesControl, notBlank } from './validators';

describe('matchesControl', () => {
  const buildForm = () =>
    new FormGroup({
      password: new FormControl('secreto123', { nonNullable: true }),
      confirm: new FormControl('', { nonNullable: true, validators: matchesControl('password') }),
    });

  it('marca mismatch si los valores difieren', () => {
    const form = buildForm();
    form.controls.confirm.setValue('otra');
    expect(form.controls.confirm.hasError('mismatch')).toBe(true);
  });

  it('es válido si coinciden', () => {
    const form = buildForm();
    form.controls.confirm.setValue('secreto123');
    expect(form.controls.confirm.valid).toBe(true);
  });
});

describe('notBlank', () => {
  it('rechaza solo espacios y acepta texto', () => {
    expect(new FormControl('   ', notBlank).hasError('blank')).toBe(true);
    expect(new FormControl('hola', notBlank).valid).toBe(true);
  });
});

describe('controlErrorMessage', () => {
  it('traduce errores estándar', () => {
    expect(controlErrorMessage(new FormControl('', Validators.required).errors)).toBe(
      'Este campo es obligatorio.',
    );
    expect(controlErrorMessage(new FormControl('ab', Validators.minLength(8)).errors)).toBe(
      'Debe tener al menos 8 caracteres.',
    );
  });

  it('prioriza los mensajes personalizados', () => {
    expect(controlErrorMessage({ pattern: true }, { pattern: 'Solo letras.' })).toBe(
      'Solo letras.',
    );
  });

  it('devuelve null sin errores', () => {
    expect(controlErrorMessage(null)).toBeNull();
  });
});
