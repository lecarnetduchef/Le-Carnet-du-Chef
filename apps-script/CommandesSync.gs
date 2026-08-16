/**
 * LE CARNET DU CHEF — Pont Google Sheets → Firestore /commandes
 *
 * À utiliser dans le projet Apps Script lié à la feuille de réponses
 * Google Sheets EXISTANTE du formulaire de commande.
 *
 * Aucun stock, paiement, Stripe, remboursement ou facturation n'est géré ici.
 */

const FIRESTORE_PROJECT_ID = 'carnet-du-chef';
const FIRESTORE_DATABASE_ID = '(default)';
const COMMANDES_COLLECTION = 'commandes';

const HEADERS = {
  HORODATEUR: 'Horodateur',
  NOM_UTILISATEUR: "Nom d'utilisateur",
  DATE_COMMANDE: 'Pour quelle date souhaitez-vous commander ?',
  CRENEAU: 'Quand souhaitez-vous recevoir votre commande ?',
  MODE_RECEPTION: 'Comment souhaitez-vous recevoir votre commande ?',
  FORMULE: 'Quelle formule souhaitez-vous commander ?',
  PLAT: 'Quel plat souhaitez-vous choisir ?',
  DESSERT: 'Quel dessert souhaitez-vous choisir ?',
  BOISSON: 'Quelle boisson souhaitez-vous choisir ?',
  PRENOM: 'Prénom',
  NOM: 'Nom',
  TELEPHONE: 'Numéro de téléphone',
  EMAIL: 'Adresse e-mail',
  ADRESSE: 'Adresse complète de livraison',
  CODE_POSTAL: 'Code postal',
  VILLE: 'Ville',
  PRECISIONS: 'Précisions concernant votre commande',
  ALLERGIES: 'Avez-vous une allergie, une intolérance ou une information alimentaire importante à signaler ?',
  MODE_PAIEMENT: 'Comment souhaitez-vous régler votre commande ?',
  CONFIRMATION: 'Je confirme avoir vérifié les informations de ma demande.',
};

/**
 * À exécuter UNE FOIS dans l'éditeur Apps Script pour installer le déclencheur.
 * Le script supprime d'abord ses anciens déclencheurs de synchronisation afin
 * d'éviter qu'une même réponse soit traitée plusieurs fois par plusieurs triggers.
 */
function installerDeclencheurCommandes() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'synchroniserCommandeDepuisFormulaire') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('synchroniserCommandeDepuisFormulaire')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();

  Logger.log('Déclencheur Google Sheets → Firestore installé.');
}

/**
 * Déclencheur installable : une nouvelle réponse Google Forms arrive dans Sheets.
 */
function synchroniserCommandeDepuisFormulaire(e) {
  if (!e || !e.range || !e.values) {
    throw new Error('Événement de soumission Google Sheets invalide.');
  }

  const rowNumber = e.range.getRow();
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, e.values.length).getDisplayValues()[0];
  const values = e.values;
  const row = rowToObject(headers, values);

  creerCommandeFirestore(row, rowNumber);
}

/**
 * Permet de synchroniser manuellement la dernière réponse existante.
 * Utile pour vérifier le pont avec la vraie réponse déjà présente dans la feuille.
 * Aucun doublon ne sera créé si elle existe déjà dans Firestore.
 */
function synchroniserDerniereReponse() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    throw new Error('Aucune réponse disponible dans la feuille active.');
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(lastRow, 1, 1, lastColumn).getDisplayValues()[0];
  const row = rowToObject(headers, values);

  return creerCommandeFirestore(row, lastRow);
}

function rowToObject(headers, values) {
  const row = {};
  headers.forEach((header, index) => {
    if (!header) return;
    row[header] = values[index] == null ? '' : String(values[index]);
  });
  return row;
}

function creerCommandeFirestore(row, rowNumber) {
  const horodateur = getValue(row, HEADERS.HORODATEUR);
  if (!horodateur) {
    throw new Error('La colonne "Horodateur" est vide : commande non créée.');
  }

  // Identifiant déterministe : même horodateur + même ligne = même commande.
  // Le numéro de ligne évite une collision théorique si deux réponses portent
  // exactement le même horodateur.
  const commandeId = 'gf_' + sha256Hex(horodateur + '\n' + rowNumber);
  const numeroCommande = 'CDC-' + commandeId.substring(3, 15).toUpperCase();

  const fields = {
    numeroCommande: stringValue(numeroCommande),
    createdAt: timestampOrStringValue(horodateur),
    horodateur: stringValue(horodateur),
    dateCommande: stringValue(getValue(row, HEADERS.DATE_COMMANDE)),
    creneau: stringValue(getValue(row, HEADERS.CRENEAU)),
    modeReception: stringValue(getValue(row, HEADERS.MODE_RECEPTION)),
    formule: stringValue(getValue(row, HEADERS.FORMULE)),
    plat: stringValue(getValue(row, HEADERS.PLAT)),
    dessert: stringValue(getValue(row, HEADERS.DESSERT)),
    boisson: stringValue(getValue(row, HEADERS.BOISSON)),
    nomUtilisateur: stringValue(getValue(row, HEADERS.NOM_UTILISATEUR)),
    client: mapValue({
      prenom: stringValue(getValue(row, HEADERS.PRENOM)),
      nom: stringValue(getValue(row, HEADERS.NOM)),
      telephone: stringValue(getValue(row, HEADERS.TELEPHONE)),
      email: stringValue(getValue(row, HEADERS.EMAIL)),
    }),
    adresse: stringValue(getValue(row, HEADERS.ADRESSE)),
    codePostal: stringValue(getValue(row, HEADERS.CODE_POSTAL)),
    ville: stringValue(getValue(row, HEADERS.VILLE)),
    precisions: stringValue(getValue(row, HEADERS.PRECISIONS)),
    allergies: stringValue(getValue(row, HEADERS.ALLERGIES)),
    modePaiement: stringValue(getValue(row, HEADERS.MODE_PAIEMENT)),
    confirmation: stringValue(getValue(row, HEADERS.CONFIRMATION)),
    statut: stringValue('nouvelle'),
    source: stringValue('google_forms'),
  };

  const url =
    'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(FIRESTORE_PROJECT_ID) +
    '/databases/' +
    encodeURIComponent(FIRESTORE_DATABASE_ID) +
    '/documents/' +
    COMMANDES_COLLECTION +
    '?documentId=' +
    encodeURIComponent(commandeId);

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  // Firestore createDocument refuse 409 si le document existe déjà.
  // Cela garantit qu'une réponse déjà synchronisée n'est pas recréée.
  if (status === 409) {
    Logger.log('Commande déjà synchronisée : ' + commandeId);
    return { status: 'already_exists', commandeId, numeroCommande };
  }

  if (status < 200 || status >= 300) {
    throw new Error('Firestore a refusé la création (' + status + ') : ' + body);
  }

  Logger.log('Commande créée dans Firestore : ' + commandeId);
  return { status: 'created', commandeId, numeroCommande };
}

function getValue(row, header) {
  return Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
}

function stringValue(value) {
  return { stringValue: value == null ? '' : String(value) };
}

function timestampOrStringValue(value) {
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return { timestampValue: date.toISOString() };
  }
  // La valeur originale est conservée si Google fournit un format non analysable.
  return stringValue(value);
}

function mapValue(fields) {
  return { mapValue: { fields } };
}

function sha256Hex(text) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );

  return digest.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}
