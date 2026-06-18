-- ============================================================
-- MUMI AMAZONIA — Seed de datos iniciales
-- Ejecutar DESPUÉS del schema.sql
-- NOTA: Los usuarios de auth se crean desde la app en /setup
-- ============================================================

-- Configuración global
INSERT INTO app_config (key, value) VALUES
  ('cif_unidades_fallback', '600')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- EMPLEADOS
-- ============================================================
INSERT INTO employees (nombre, cargo, tipo_pago, salario, estado) VALUES
  ('Operario 1',    'Operario',       'nomina', 1750905, 'activo'),
  ('Operario 2',    'Operario',       'nomina', 1750905, 'activo'),
  ('Administrador', 'Administrador',  'nomina', 1750905, 'activo')
ON CONFLICT DO NOTHING;

-- ============================================================
-- MATERIAS PRIMAS (25 ítems reales de Mumi Amazonia)
-- ============================================================
INSERT INTO raw_materials (nombre, categoria, tipo, unidad, precio, stock_min, stock) VALUES
  ('MERMELADA DE ARAZÁ',      'subproducto', 'interno',   'Kg',     28000,  5,   0),
  ('MERMELADA DE ASAÍ',       'subproducto', 'interno',   'Kg',     27500,  5,   0),
  ('MERMELADA DE COPOAZÚ',    'subproducto', 'interno',   'Kg',     26000,  5,   0),
  ('PULPA DE ASAÍ',           'pulpa',       'comprado',  'Kg',      8000, 10,   0),
  ('PULPA DE SEJE',           'pulpa',       'comprado',  'Kg',      7000, 10,   0),
  ('PULPA DE COCONA',         'pulpa',       'comprado',  'Kg',      9000, 10,   0),
  ('PULPA DE ARAZÁ',          'pulpa',       'comprado',  'Kg',      8000, 10,   0),
  ('AçAI LIOFILIZADO',        'deshidratado','comprado',  'Kg',    200000,  2,   0),
  ('ARAZÁ DESHIDRATADO',      'deshidratado','interno',   'Kg',     95000,  2,   0),
  ('COCONA DESHIDRATADA',     'deshidratado','interno',   'Kg',     85000,  2,   0),
  ('MORICHE DESHIDRATADO',    'deshidratado','interno',   'Kg',     20000,  5,   0),
  ('HARINA DE CACAY',         'harina',      'comprado',  'Kg',     74000,  3,   0),
  ('LIMONARIA DESHIDRATADA',  'deshidratado','interno',   'Kg',     50000,  2,   0),
  ('AZÚCAR',                  'otro',        'comprado',  'Kg',      4100, 20,   0),
  ('MANTEQUILLA',             'otro',        'comprado',  'Kg',     11000,  5,   0),
  ('HARINA DE TRIGO',         'harina',      'comprado',  'Kg',      2700, 20,   0),
  ('PECTINA',                 'aditivo',     'comprado',  'Kg',    120000,  1,   0),
  ('ÁCIDO CÍTRICO',           'aditivo',     'comprado',  'Kg',     18000,  1,   0),
  ('BOLSA METALIZADA',        'empaque',     'comprado',  'Unidad',   300, 200,  0),
  ('CAJA BOCADILLOS',         'empaque',     'comprado',  'Unidad',  1000, 100,  0),
  ('CAJA INFUSIONES',         'empaque',     'comprado',  'Unidad',  1000,  50,  0),
  ('FILTRO DE TÉ',            'empaque',     'comprado',  'Unidad',   195, 500,  0),
  ('FÉCULA',                  'harina',      'comprado',  'Kg',      4520,  5,   0),
  ('CONSERVANTE (SORBATO)',   'aditivo',     'comprado',  'Kg',     80000,  0.5, 0),
  ('GOMA GUAR',               'aditivo',     'comprado',  'Kg',     10000,  0.5, 0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- CIF (valores reales 2026)
-- ============================================================
INSERT INTO cif_items (descripcion, categoria, frecuencia, valor) VALUES
  ('Arriendo espacio',              'Infraestructura', 'mensual',    500000),
  ('Energía eléctrica',             'Servicios',       'mensual',    380000),
  ('Agua y Alcantarillado',         'Servicios',       'mensual',     20000),
  ('Comunicación celular',          'Comunicaciones',  'mensual',     25000),
  ('Mantenimiento instalaciones',   'Mantenimiento',   'mensual',     30000),
  ('Honorarios Contador',           'Honorarios',      'mensual',    800000),
  ('Transporte / Combustible',      'Logística',       'mensual',    200000),
  ('Publicidad',                    'Marketing',       'mensual',     60000),
  ('Útiles y Papelería',            'Administración',  'mensual',     50000),
  ('Aseo y Cafetería',              'Administración',  'mensual',     80000),
  ('Registro Mercantil',            'Legal',           'anual',     1560000),
  ('Impuesto Industria y Comercio', 'Impuestos',       'anual',      500000),
  ('Cuota préstamo (capital)',       'Financiero',      'mensual',    278221),
  ('Intereses préstamo',            'Financiero',      'mensual',    210330),
  ('Seguro préstamo',               'Financiero',      'mensual',     42570)
ON CONFLICT DO NOTHING;

-- ============================================================
-- REGISTROS DE PRODUCCIÓN (histórico 2025)
-- ============================================================
INSERT INTO production_records (producto, fecha, lote, vence, empaque, cantidad, inicio, fin, labor, responsable, obs, estado) VALUES
  ('DULCE ARAZA',   '2025-01-07', '07-01-2025', '2025-07-07', 'CAJAS',    84, '07:30', '15:30', 'EMPACADO',              'PAOLA DURAN',      '',                         'conforme'),
  ('GALLETA ARAZA', '2025-01-08', '08-01-2025', '2025-03-08', 'UNIDADES', 66, NULL,    NULL,    'PRODUCCION',            'LAURA BENAVIDES',  '',                         'conforme'),
  ('GALLETA ASAI',  '2025-01-08', '08-01-2025', '2025-03-08', 'UNIDADES', 60, NULL,    NULL,    '',                      '',                 '',                         'conforme'),
  ('DULCE SEJE',    '2025-01-09', '09-01-2025', '2025-07-09', 'CAJAS',    88, NULL,    NULL,    '',                      '',                 '',                         'conforme'),
  ('GALLETA MORICHE','2025-01-10','10-01-2025', '2025-03-10', 'UNIDADES', 82, NULL,    NULL,    '',                      '',                 '',                         'conforme'),
  ('DULCE COCONA',  '2025-01-21', '20-01-2025', '2025-07-20', 'CAJAS',    95, '08:30', '16:45', '',                      '',                 '',                         'conforme'),
  ('GALLETA ARAZA', '2025-03-25', '925',         '2025-05-25', 'UNIDADES',  0, NULL,    NULL,    '',                      '',                 'No conforme, desechado',   'no conforme'),
  ('INFUSION ASAI', '2025-03-04', '03-04-2025', '2026-06-04', 'CAJAS',    83, NULL,    NULL,    '',                      '',                 '',                         'conforme')
ON CONFLICT DO NOTHING;

-- ============================================================
-- RECETAS BASE (4 dulces predefinidos)
-- ============================================================
INSERT INTO recipes (nombre, tipo, brix, brix_aplica, rendimiento, desperdicio, peso_unidad, ingredientes, ancla, cantidad_ancla, fecha) VALUES
  ('Dulce Mumi de Seje', 'base', 75, true, 61, 3, 75,
   '[{"nombre":"Pulpa de Seje","pct":56.81,"precio":7000,"tipo":"normal","base":"total"},{"nombre":"Azúcar","pct":40.58,"precio":3800,"tipo":"normal","base":"total"},{"nombre":"Pectina","pct":2.06,"precio":120000,"tipo":"normal","base":"total"},{"nombre":"Conservante","pct":0.05,"precio":40000,"tipo":"normal","base":"total"},{"nombre":"Goma Guar","pct":0.20,"precio":19000,"tipo":"normal","base":"total"},{"nombre":"Ácido Cítrico","pct":0.30,"precio":18000,"tipo":"normal","base":"total"}]',
   'Pulpa de Seje', 0, '2025-01-01'),
  ('Dulce Mumi de Asaí', 'base', 75, true, 64.5, 1, 75,
   '[{"nombre":"Pulpa de Asaí","pct":57.33,"precio":9000,"tipo":"normal","base":"total"},{"nombre":"Azúcar","pct":40.26,"precio":3800,"tipo":"normal","base":"total"},{"nombre":"Pectina","pct":2.05,"precio":120000,"tipo":"normal","base":"total"},{"nombre":"Conservante","pct":0.05,"precio":40000,"tipo":"normal","base":"total"},{"nombre":"Goma Guar","pct":0.05,"precio":18000,"tipo":"normal","base":"total"},{"nombre":"Ácido Cítrico","pct":0.25,"precio":19000,"tipo":"normal","base":"total"}]',
   'Pulpa de Asaí', 0, '2025-01-01'),
  ('Dulce Mumi de Cocona', 'base', 75, true, 62, 0.5, 75,
   '[{"nombre":"Pulpa de Cocona","pct":55.50,"precio":9000,"tipo":"normal","base":"total"},{"nombre":"Azúcar","pct":41.89,"precio":3800,"tipo":"normal","base":"total"},{"nombre":"Pectina","pct":2.27,"precio":120000,"tipo":"normal","base":"total"},{"nombre":"Conservante","pct":0.04,"precio":40000,"tipo":"normal","base":"total"},{"nombre":"Goma Guar","pct":0.14,"precio":18000,"tipo":"normal","base":"total"},{"nombre":"Ácido Cítrico","pct":0.16,"precio":19000,"tipo":"normal","base":"total"}]',
   'Pulpa de Cocona', 0, '2025-01-01'),
  ('Dulce Mumi de Arazá', 'base', 75, true, 62, 2, 75,
   '[{"nombre":"Pulpa de Arazá","pct":56.85,"precio":10000,"tipo":"normal","base":"total"},{"nombre":"Azúcar","pct":40.61,"precio":3800,"tipo":"normal","base":"total"},{"nombre":"Pectina","pct":2.44,"precio":120000,"tipo":"normal","base":"total"},{"nombre":"Conservante","pct":0.04,"precio":40000,"tipo":"normal","base":"total"},{"nombre":"Ácido Cítrico","pct":0.07,"precio":18000,"tipo":"normal","base":"total"},{"nombre":"Goma Guar","pct":0.00,"precio":19000,"tipo":"normal","base":"total"}]',
   'Pulpa de Arazá', 0, '2025-01-01')
ON CONFLICT DO NOTHING;
