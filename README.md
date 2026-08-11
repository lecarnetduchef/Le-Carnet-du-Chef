# Le Carnet du Chef — Guide du site (V1.1)

Ce guide est écrit pour vous, sans connaissances techniques particulières.
Il explique où modifier chaque information et comment mettre le site en ligne.

---

## 1. Ce que vous pouvez modifier vous-même, et où

Tout ce qui change régulièrement est regroupé dans **deux fichiers seulement**.
Vous n'avez jamais besoin de toucher aux fichiers `.html` ou `.css` pour ces éléments-là.

### 📁 `js/config.js` — coordonnées, liens, horaires, état des commandes

Ouvrez ce fichier avec un simple éditeur de texte (Bloc-notes, TextEdit, ou
n'importe quel éditeur de code). Chaque ligne ressemble à :

```javascript
telephone: "[NUMÉRO DE TÉLÉPHONE]",
```

Remplacez uniquement le texte entre guillemets, par exemple :

```javascript
telephone: "04 77 XX XX XX",
```

Ce fichier centralise :

| Ce que vous voulez changer | Où, dans `config.js` |
|---|---|
| Lien du formulaire de commande | `liens.commandeGenerale` |
| Lien du formulaire de devis | `liens.devis` |
| Instagram / TikTok / Snapchat / WhatsApp | `liens.instagram`, `liens.tiktok`, `liens.snapchat`, `liens.whatsapp` |
| Téléphone / email | `contact.telephone`, `contact.email` (+ leurs versions `Href`, à modifier à l'identique) |
| Zone de l'emporter | `zones.emporter` |
| Zone du traiteur / chef à domicile | `zones.traiteur` |
| Horaires retrait / livraison | `horaires.dejeunerRetrait`, `horaires.dejeunerLivraison`, `horaires.soirRetrait`, `horaires.soirLivraison` |
| Frais de livraison | `fraisLivraison` (laissez `""` tant que non défini — le site affiche alors « communiqués lors de la confirmation ») |
| Heure limite pour commander le déjeuner | `commandes.limiteDejeuner` (ex. `"11:30"`) |
| Heure limite pour commander le dîner | `commandes.limiteDiner` (ex. `"20:00"`) |
| Message affiché quand le déjeuner est fermé | `commandes.messageDejeunerFerme` |
| Message affiché quand le dîner est fermé | `commandes.messageDinerFerme` |
| **Fermer le déjeuner à la main** (ex. rupture de stock) | `commandes.fermetureManuelleDejeuner` → `true` / `false` |
| **Fermer le dîner à la main** | `commandes.fermetureManuelleDiner` → `true` / `false` |
| **Fermeture exceptionnelle totale** (vacances, urgence) | `commandes.fermetureExceptionnelle.active` → `true` / `false`, avec `commandes.fermetureExceptionnelle.message` |

### Comment fonctionne la fermeture automatique des commandes

Le site calcule lui-même, à chaque chargement de page, l'heure actuelle
**en France** (il gère automatiquement le passage heure d'été/hiver) et la
compare aux heures limites que vous avez définies :

- **Avant `limiteDejeuner` (11h30 par défaut)** → commande du déjeuner possible.
- **Entre `limiteDejeuner` et `limiteDiner` (11h30–20h00 par défaut)** → le
  déjeuner affiche automatiquement le message `messageDejeunerFerme`, mais
  le dîner reste commandable.
- **Après `limiteDiner` (20h00 par défaut)** → les deux services affichent
  le message `messageDinerFerme` (« vous pouvez commander pour demain »).
  Dès minuit passé, le site repasse automatiquement en mode « déjeuner
  ouvert » sans aucune action de votre part.

Vous n'avez donc normalement **rien à faire au quotidien** — le système se
gère seul. Vous n'intervenez que dans deux cas :

**Fermer un seul service ponctuellement** (ex. rupture de stock au
déjeuner) :

```javascript
fermetureManuelleDejeuner: true,   // repassez à false pour rouvrir
```

**Fermer complètement le site aux commandes** (vacances, urgence) :

```javascript
fermetureExceptionnelle: {
  active: true,
  message: "Nous sommes en congés du 10 au 20 août. Les commandes rouvriront le 21 août.",
},
```

Dans les deux cas, le changement s'applique automatiquement sur
**toutes** les pages du site (boutons « Commander » du menu, de l'accueil,
et de chaque plat) dès l'enregistrement du fichier. Les boutons
« Demander un devis » (traiteur / chef à domicile) ne sont **jamais**
concernés par ces réglages — ils fonctionnent toujours normalement.

### 📁 `data/menus.json` — vos plats

Chaque plat est un bloc entre accolades `{ }`. Pour **modifier** un plat,
changez le texte entre guillemets. Pour **ajouter** un plat, copiez un bloc
entier (avec ses accolades) et collez-le avant le `]` final, en le séparant
du précédent par une virgule. Pour **supprimer** un plat, effacez tout son
bloc `{ ... }` (et la virgule qui le sépare du bloc suivant s'il y en a une).

```json
{
  "id": "lasagnes-maison",
  "nom": "Lasagnes maison",
  "categorie": "Plat",
  "description": "Une recette traditionnelle, sauce bolognaise et béchamel maison.",
  "prix": "12 €",
  "disponible": true,
  "image": ""
}
```

- `"disponible": false` → le plat reste visible mais affiche « Indisponible »
  au lieu du bouton Commander.
- `"image": ""` → un placeholder texte s'affiche. Une fois votre photo prête,
  indiquez son chemin, par exemple `"image": "../images/plats/lasagnes.jpg"`
  — la photo remplace alors automatiquement le placeholder.

Il n'y a **aucune limite** au nombre de plats : le site affiche exactement
ce qu'il trouve dans ce fichier, ni plus, ni moins.

---

## 2. Ajouter vos photos (appareil Canon)

⚠️ **Important — photos temporaires actuellement en place.** Pour que vous
puissiez visualiser le site fini avant publication, 5 photos de banque
d'images (Pexels, libres de droits, sans attribution requise) ont été
placées à titre temporaire : l'image de fond de l'accueil, les 3 photos
de plats d'exemple, et la photo « événement » de la page Traiteur. **Ce
ne sont pas de vraies photos du Carnet du Chef** — à remplacer avant la
mise en ligne définitive. Deux zones ont volontairement été laissées de
côté avec leur placeholder texte d'origine : la photo du chef (page À
propos) et la photo « chef en cuisine » (page Traiteur), en attendant que
vous choisissiez vous-même ces visuels plus personnels.

Pour remplacer une photo temporaire par une vraie photo :
- **Photo d'accueil** → `js/config.js`, `images.hero`
- **Photo « événement » Traiteur** → `js/config.js`, `images.traiteurEvenement`
- **Photos de plats** → `data/menus.json`, champ `"image"` de chaque plat

Dans les trois cas, remplacez simplement l'adresse actuelle entre
guillemets par le chemin de votre propre photo (une fois placée dans le
dossier `images/` ci-dessous), par exemple :
`"images/plats/lasagnes.jpg"` — aucune autre modification n'est nécessaire,
la photo se met à jour automatiquement partout où elle apparaît.

Placez vos photos dans les dossiers déjà prévus :

```
images/
├── logo/         → votre logo, si vous en créez un
├── plats/        → photos de plats (pour menus.json)
├── chef/         → photos du chef (page À propos, page Traiteur)
├── evenements/   → photos de prestations traiteur
└── autres/       → tout le reste
```

Pour la photo du chef ou la photo « chef en cuisine » (zones encore en
placeholder texte) : remplacez la zone `<div class="photo-placeholder">...
</div>` dans le fichier `.html` concerné (`pages/apropos.html` ou
`pages/traiteur.html`) par une balise
`<img src="../images/chef/votre-photo.jpg" alt="Description de la photo">`.
Si vous n'êtes pas à l'aise avec cette étape, indiquez-moi simplement quelle
photo va où et je fais le remplacement.

Aucun outil payant n'est nécessaire : vos fichiers JPEG issus du Canon
fonctionnent directement (pensez simplement à les compresser légèrement
avant mise en ligne pour un chargement rapide sur mobile — un export à
1600px de large maximum est largement suffisant pour le web).

---

## 3. Favicon (la petite icône dans l'onglet du navigateur)

Un favicon a été créé et est déjà en place :
`favicon/favicon.ico` (+ `favicon/apple-touch-icon.png` pour iPhone/iPad).
Il reprend le motif « carnet » du site (vert sauge, page crème, reliure
pointillée) — vous n'avez rien à faire pour qu'il fonctionne. Si vous créez
un vrai logo plus tard, remplacez simplement ces deux fichiers par vos
propres versions en conservant exactement les mêmes noms.

---

## 4. Fonctionnement des plats à emporter (rappel)

- Zone : **Roanne et son secteur** uniquement.
- Retrait : 11h30–12h00 (déjeuner) / 19h30 (soir).
- Livraison : 12h00–13h00 (déjeuner) / 20h00–21h00 (soir).
- L'adresse exacte de retrait **n'est jamais affichée sur le site** — elle
  est à communiquer vous-même au client une fois sa commande confirmée.
- La livraison nécessite que le client indique son adresse dans le
  formulaire de commande.
- Une commande envoyée n'est **jamais confirmée automatiquement** — c'est
  vous qui validez après vérification.
- Les commandes se ferment **automatiquement** à 11h30 pour le déjeuner et
  20h00 pour le dîner (heure française) — voir section 1 pour tout
  personnaliser.

Le traiteur et le chef à domicile ne sont **pas** limités à Roanne : la
zone (Loire, Saint-Étienne, Lyon, Clermont-Ferrand et au-delà sur demande)
est distincte et modifiable dans `zones.traiteur`.

---

## 5. Google Forms — ce qu'il faut configurer pour recevoir les demandes

Le site ne fait qu'ouvrir vos formulaires Google Forms dans un nouvel
onglet — il ne vous envoie rien automatiquement par lui-même. C'est
**Google Forms qui doit être configuré** pour vous notifier :

1. Ouvrez votre formulaire sur [forms.google.com](https://forms.google.com).
2. Cliquez sur l'onglet **Réponses**.
3. Cliquez sur les trois points **⋮** en haut à droite de cet onglet.
4. Cochez **« Recevoir des notifications par e-mail pour les nouvelles réponses »**.
5. Vous recevrez alors un email à chaque nouvelle réponse, à l'adresse
   Google avec laquelle vous avez créé le formulaire.

Si vous voulez que ces emails arrivent sur votre **boîte professionnelle**
plutôt que sur votre compte Google personnel, deux solutions simples :
- créez le formulaire directement avec un compte Google lié à votre adresse
  professionnelle (le plus simple) ;
- ou configurez une redirection automatique de votre boîte Google
  personnelle vers votre boîte professionnelle (dans les paramètres Gmail).

Répétez cette configuration pour **chacun** de vos formulaires (commande,
devis) — chaque formulaire a ses propres notifications à activer.

Toutes les réponses sont également stockées automatiquement dans un
**Google Sheets** consultable à tout moment depuis l'onglet Réponses du
formulaire (bouton « Créer une feuille de calcul »), pratique pour suivre
l'historique de vos commandes et devis.

---

## 6. Tester le site sur votre ordinateur avant mise en ligne

⚠️ **N'ouvrez jamais `index.html` en double-cliquant dessus depuis votre
explorateur de fichiers.** La page Menus a besoin de charger
`data/menus.json`, ce que les navigateurs bloquent par sécurité lorsque le
site est ouvert directement depuis un fichier (adresse commençant par
`file://`). Vous verrez alors le message « Les menus ne peuvent pas être
affichés pour le moment » même si tout fonctionne correctement — ce n'est
pas un bug, c'est uniquement lié à la façon dont vous avez ouvert le site.
**Une fois en ligne sur GitHub Pages (ou via le serveur local ci-dessous),
ce problème n'existe plus.**

Pour tester correctement, utilisez un petit serveur local :

**Si vous avez Python installé** (Mac et beaucoup de PC l'ont déjà) :

```bash
cd le-carnet-du-chef
python3 -m http.server 8000
```

Puis ouvrez `http://localhost:8000` dans votre navigateur. Faites `Ctrl+C`
(ou fermez le terminal) pour arrêter le serveur une fois le test terminé.

---

## 7. Mettre le site en ligne sur GitHub Pages

1. Créez un compte sur [github.com](https://github.com) si vous n'en avez
   pas déjà un.
2. Créez un nouveau dépôt (« repository »), par exemple nommé
   `le-carnet-du-chef`.
3. Envoyez-y tous les fichiers de ce dossier (par glisser-déposer sur
   l'interface web de GitHub, ou via Git si vous êtes à l'aise).
4. Dans le dépôt, allez dans **Settings → Pages**.
5. Sous « Source », choisissez la branche `main` et le dossier `/root`,
   puis cliquez sur **Save**.
6. Après une à deux minutes, votre site est en ligne à l'adresse
   `https://<votre-compte>.github.io/le-carnet-du-chef/`.
7. Vérifiez que chaque page s'ouvre bien, que les images/CSS se chargent,
   et que les boutons « Commander » / « Demander un devis » pointent vers
   vos vrais liens Google Forms.

---

## 8. Connecter votre domaine OVHcloud (`lecarnetduchef.fr`)

1. Achetez le domaine sur [ovhcloud.com](https://www.ovhcloud.com).
2. Dans l'espace client OVHcloud, allez dans la zone DNS de votre domaine
   et ajoutez ces enregistrements :
   - quatre enregistrements de type **A**, pointant respectivement vers :
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - un enregistrement **CNAME** pour le sous-domaine `www`, pointant vers
     `<votre-compte>.github.io`
3. Retournez dans **Settings → Pages** de votre dépôt GitHub, renseignez
   `lecarnetduchef.fr` dans le champ « Custom domain », puis cliquez sur
   **Save**.
4. Un fichier nommé `CNAME` (sans extension), contenant uniquement le
   texte `lecarnetduchef.fr`, sera automatiquement créé à la racine de
   votre dépôt par GitHub — vous n'avez rien à faire manuellement pour
   celui-ci. (Ce fichier n'existe pas encore dans ce projet puisque le
   domaine n'est pas encore acheté.)
5. Une fois les DNS propagés (parfois jusqu'à 24h), cochez la case
   **« Enforce HTTPS »** dans les mêmes réglages GitHub Pages — un
   certificat SSL gratuit est alors généré et géré automatiquement pour
   vous, sans aucune configuration technique de votre part.
6. Ouvrez `https://lecarnetduchef.fr` pour vérifier que tout fonctionne.

---

## 9. Ce qui reste à compléter avant le lancement du 1er septembre

- **`js/config.js`** : remplacer tous les `[PLACEHOLDER]` par vos vrais
  liens Google Forms et coordonnées.
- **`data/menus.json`** : remplacer les 3 plats d'exemple par vos vrais
  plats.
- **Photos** : ajouter vos photos Canon (voir section 2).
- **`pages/mentions-legales.html`** : compléter raison sociale, SIRET,
  adresse, directeur de publication, et la durée de conservation des
  données dans la section confidentialité.
- **Google Forms** : créer les formulaires de commande et de devis, puis
  activer les notifications par email (voir section 5).
- **Domaine OVHcloud** : acheter `lecarnetduchef.fr` et suivre la section 8.

---

## Structure du projet

```
le-carnet-du-chef/
├── index.html
├── pages/            → prestations, menus, traiteur, apropos, contact, mentions-legales
├── css/               → variables.css (couleurs/typos) + style.css
├── js/
│   ├── config.js      → TOUT ce qui est modifiable (liens, coordonnées, horaires, commandes)
│   ├── script.js       → navigation mobile + animations légères
│   └── menus.js        → génère la page Menus à partir de menus.json
├── data/menus.json    → vos plats
├── images/             → logo, plats, chef, événements, autres
├── favicon/            → icône du site (déjà générée)
├── robots.txt, sitemap.xml
```
