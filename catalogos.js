// Catálogos del Formato 606 (DGII, Norma General 07-2018)
const TIPOS_BS = {
  "01": "Gastos de personal",
  "02": "Gastos por trabajos, suministros y servicios",
  "03": "Arrendamientos",
  "04": "Gastos de activos fijos",
  "05": "Gastos de representación",
  "06": "Otras deducciones admitidas",
  "07": "Gastos financieros",
  "08": "Gastos extraordinarios",
  "09": "Compras y gastos que forman parte del costo de venta",
  "10": "Adquisiciones de activos",
  "11": "Gastos de seguros",
};

const FORMAS_PAGO = {
  "01": "Efectivo",
  "02": "Cheques / transferencias / depósito",
  "03": "Tarjeta crédito / débito",
  "04": "Compra a crédito",
  "05": "Permuta",
  "06": "Nota de crédito",
  "07": "Mixto",
};

const TIPOS_RET_ISR = {
  "": "— Ninguna —",
  "01": "Alquileres",
  "02": "Honorarios por servicios",
  "03": "Otras rentas",
  "04": "Otras rentas (rentas presuntas)",
  "05": "Intereses pagados a personas jurídicas residentes",
  "06": "Intereses pagados a personas físicas residentes",
  "07": "Retención por proveedores del Estado",
  "08": "Juegos telefónicos",
  "09": "Retenciones subsector de ganadería de carne bovina",
};

// Textos exactos de las listas de la herramienta 606 de la DGII (versión 2025).
// La herramienta solo lee los 2 primeros caracteres, pero así se ve igual que su lista.
const DGII_TIPOS = {
"01": "01-GASTOS DE PERSONAL ",
"02": "02-GASTOS POR TRABAJOS, SUMINISTROS Y SERVICIOS ",
"03": "03-ARRENDAMIENTOS ",
"04": "04-GASTOS DE ACTIVOS FIJO ",
"05": "05 -GASTOS DE REPRESENTACIÓN ",
"06": "06 -OTRAS DEDUCCIONES ADMITIDAS ",
"07": "07 -GASTOS FINANCIEROS ",
"08": "08 -GASTOS EXTRAORDINARIOS ",
"09": "09 -COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA ",
"10": "10 -ADQUISICIONES DE ACTIVOS ",
"11": "11- GASTOS DE SEGUROS"
};
const DGII_PAGOS = {
"01": "01 - EFECTIVO",
"02": "02 - CHEQUES/TRANSFERENCIAS/DEPÓSITO",
"03": "03 - TARJETA CRÉDITO/DÉBITO",
"04": "04 - COMPRA A CREDITO",
"05": "05 -  PERMUTA",
"06": "06 - NOTA DE CREDITO",
"07": "07 - MIXTO"
};
const DGII_RET = {
"01": "01 - ALQUILERES",
"02": "02 - HONORARIOS POR SERVICIOS",
"03": "03 - OTRAS RENTAS",
"04": "04 - OTRAS RENTAS (Rentas Presuntas)",
"05": "05 - INTERESES PAGADOS A PERSONAS JURIDICAS RESIDENTES",
"06": "06 - INTERESES PAGADOS A PERSONAS FISICAS RESIDENTES",
"07": "07 - RETENCION POR PROVEEDORES DEL ESTADO",
"08": "08 - JUEGOS TELEFONICOS",
"09": "09 - RETENCIONES SUBSECTOR DE GANADERÍA DE CARNE BOVINA"
};
