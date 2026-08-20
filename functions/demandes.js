const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const TYPES = new Set(['traiteur','chef_domicile','demande_particuliere','accompagnement','questionnaire_unique']);
const MAX_TEXT_LENGTH = 5000;
const MAX_ARRAY_ITEMS = 30;
function cleanString(value) { return String(value ?? '').replace(/\s+/g,' ').trim().slice(0, MAX_TEXT_LENGTH); }
function cleanValue(value) { return Array.isArray(value) ? value.slice(0,MAX_ARRAY_ITEMS).map(cleanString).filter(Boolean) : cleanString(value); }
function cleanPayload(body) { const result={}; for(const [key,value] of Object.entries(body||{})){ if(key==='website'||key==='confirmation') continue; result[key]=cleanValue(value); } return result; }
function isEmail(value){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function hasValue(value){ return Array.isArray(value) ? value.length>0 : cleanString(value)!==''; }
function validate(data){
  if(!TYPES.has(data.type)) return 'Type de demande invalide.';
  for(const field of ['prenom','nom','email']) if(!hasValue(data[field])) return `Le champ ${field} est obligatoire.`;
  if(!isEmail(data.email)) return "L'adresse e-mail est invalide.";
  if((data.type==='demande_particuliere'||data.type==='accompagnement') && !hasValue(data.descriptionProjet) && !hasValue(data.descriptionLibre)) return 'Décrivez-nous simplement votre projet.';
  return null;
}
function buildDocument(data){
  const now=admin.firestore.FieldValue.serverTimestamp();
  const initial=['traiteur','chef_domicile','demande_particuliere','accompagnement'].includes(data.type)?data.type:'accompagnement';
  const profile=['particulier','professionnel','non_renseigne'].includes(data.profil)?data.profil:'non_renseigne';
  const projectDescription=data.descriptionProjet||data.descriptionLibre||'';
  const dateStatus=['confirmee','approximative','non_definie'].includes(data.dateStatut)?data.dateStatut:'non_definie';
  const eventDate=data.dateEvenement||'';
  return {
    type:initial,
    besoinInitial:{ choix:initial, texteLibre:cleanString(data.descriptionLibre||'') },
    client:{ prenom:data.prenom, nom:data.nom, email:data.email, telephone:data.telephone||'', particulierProfessionnel:profile, contactPreference:data.contactPreference||'peu_importe' },
    projet:{ description:projectDescription, occasion:data.occasion||'non_renseigne', details:data.informationsComplementaires||data.infosComplementaires||'', typePrestation:data.typePrestation||'non_defini' },
    prestation:{ type:data.typePrestation||'non_defini', formuleSouhaitee:data.formuleSouhaitee||'', cuisine:data.cuisine||'', platsSouhaites:data.platsSouhaites||'', servicesSouhaites:data.services||[], equipementsCuisine:data.equipementsCuisine||[], informationsCuisine:data.infosCuisine||'', besoinsParticuliers:data.besoinsParticuliers||'' },
    evenement:{ date:eventDate, heureDebut:data.heureDebut||'', heureFin:data.heureFin||'', duree:data.duree||'', dateStatut:dateStatus },
    dateEvenement:eventDate,
    dateSouhaitee:eventDate,
    heure:data.heureDebut||'',
    heureDebut:data.heureDebut||'',
    heureFin:data.heureFin||'',
    nombrePersonnes:data.nombrePersonnes||null,
    preferences:{ alimentsPrivilegies:data.alimentsPrioriser||'', alimentsEvites:data.alimentsEviter||'', allergies:data.contraintesAlimentaires||data.allergies||'', contraintesAlimentaires:data.contraintesAlimentaires||'', autres:'' },
    budget:{ montant:data.budget||null, devise:'EUR', statut:data.budgetStatut||'ne_sait_pas', commentaire:'' },
    lieu:{ adresse:data.adresse||'', codePostal:data.codePostal||'', ville:data.ville||'', pays:'France', confirme:data.lieuConfirme||'non_renseigne', precisions:'' },
    qualification:{ categorie:'a_qualifier', sousCategorie:'', priorite:'normale', potentiel:'non_evalue', besoinPrecision:false, commentaireInterne:'' },
    statut:'nouvelle',
    source:{ formulaire:'questionnaire_unique', version:1 },
    createdAt:now,
    updatedAt:now,
    legacy:{ typePrestation:data.typePrestation||'', descriptionProjet:projectDescription, dateEvenement:eventDate, dateSouhaitee:eventDate, heure:data.heureDebut||'', service:data.service||'', demande:data.demande||data.platsSouhaites||'', budget:data.budget||'' }
  };
}
const submitDemande=onRequest({region:'europe-west9',cors:['https://lecarnetduchef.fr','https://lecarnetduchef.github.io']},async(req,res)=>{
  if(req.method!=='POST'){res.set('Allow','POST');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED',message:'Méthode non autorisée.'});}
  try{const body=req.body&&typeof req.body==='object'?req.body:{};if(cleanString(body.website))return res.status(400).json({ok:false,code:'INVALID_REQUEST',message:'Requête invalide.'});const data=cleanPayload(body);const error=validate(data);if(error)return res.status(400).json({ok:false,code:'VALIDATION_ERROR',message:error});const reference=await db.collection('demandes').add(buildDocument(data));return res.status(201).json({ok:true,id:reference.id,message:'Demande enregistrée.'});}
  catch(error){console.error('Erreur lors de l’enregistrement d’une demande :',error);return res.status(500).json({ok:false,code:'INTERNAL_ERROR',message:'Impossible d’enregistrer la demande pour le moment.'});}
});
module.exports={submitDemande};
