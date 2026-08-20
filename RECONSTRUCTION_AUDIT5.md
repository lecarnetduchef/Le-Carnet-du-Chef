# Reconstruction — audit 5

Référence de reconstruction : main / bae5f6c.

Principes conservés :
- Le nouveau catalogue / page Commander reste la référence client.
- L’ancienne page Menus/PDF n’est pas réintroduite comme système de commande.
- Les formulaires de demande/devis existants restent en place.
- Les commandes utilisent la validation serveur et la séparation paymentAttempts / commandes.
- Aucun fournisseur Revolut ou Stripe n’est réintroduit dans le socle de paiement concerné.
- Les paramètres commandes (modeManuel, horaires, fermetures) restent la source serveur.

Fichiers audités avant reconstruction :
- functions/idempotency.js
- functions/order.js
- functions/createPayment.js
- functions/index.js
- admin/commandes-config.js
