/**
 * Proxy de compatibilidad hacia lib/db.js
 * Los archivos ejecutables se mantienen en lib/ para evitar enmascaramiento por volúmenes Docker
 */
module.exports = require('../lib/db.js');
