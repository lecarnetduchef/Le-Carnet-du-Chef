import { addToCart, addPetitDejeunerToCart, addProductToCart, getCart, removeLine, updateLineQuantity, getCartTotal } from "./panier.js?v=20260925";

const GET_CATALOGUE_URL="https://europe-west9-carnet-du-chef.cloudfunctions.net/getCatalogue";
const euro=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
const labels={
 chef:{title:"Formules du Chef",description:"Des formules complètes pour tous les moments."},
 speciales:{title:"Formules spéciales",description:"Des créations uniques pour les occasions particulières."},
 "petit-dejeuner":{title:"Petit déjeuner",description:"Un réveil gourmand."},
 brunch:{title:"Formule Brunch",description:"La pause conviviale."},
 fromages:{title:"Plateaux de fromages",description:"Une sélection raffinée."}
};
let data={formules:[],produits:[],petitDejeunerElements:[]};
let productsByCategory=new Map();

function categoryOf(f){
 const explicit=String(f?.categorieFormule||f?.categorie||f?.type||"").trim().toLowerCase();
 if(["speciale","speciales","special"].includes(explicit)) return "speciales";
 if(["petit-dejeuner","petit déjeuner","petit_dejeuner"].includes(explicit)) return "petit-dejeuner";
 if(explicit==="brunch") return "brunch";
 if(["fromage","fromages"].includes(explicit)) return "fromages";
 if(["chef","formule","formules"].includes(explicit)) return "chef";
 const name=String(f?.nom||"").toLowerCase();
 if(name.includes("petit déjeuner")||name.includes("petit dejeuner")) return "petit-dejeuner";
 if(name.includes("brunch")) return "brunch";
 if(name.includes("fromage")) return "fromages";
 if(name.includes("spéciale")||name.includes("speciale")||name.includes("offre spéciale")||name.includes("offre speciale")) return "speciales";
 return "chef";
}
function setupImageModal() {
  if (document.getElementById("catalogue-image-modal")) return;

  const style = document.createElement("style");
  style.id = "catalogue-image-modal-style";
  style.textContent = `
    .catalogue-image-clickable{cursor:zoom-in}
    .catalogue-image-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(20,28,24,.82);box-sizing:border-box}
    .catalogue-image-modal[hidden]{display:none}
    .catalogue-image-modal-content{position:relative;display:flex;align-items:center;justify-content:center;width:min(96vw,1200px);height:min(94vh,900px);box-sizing:border-box}
    .catalogue-image-modal img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .catalogue-image-modal-close{position:absolute;top:-.75rem;right:-.75rem;width:2.5rem;height:2.5rem;border:0;border-radius:50%;background:#fff;color:#314c40;font-size:1.8rem;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 6px 20px rgba(0,0,0,.2)}
    .catalogue-image-modal-close:focus-visible{outline:3px solid #fff;outline-offset:3px}
    @media(max-width:620px){.catalogue-image-modal{padding:.65rem}.catalogue-image-modal-content{width:100%;height:92vh}.catalogue-image-modal-close{top:.25rem;right:.25rem}}
  `;
  document.head.appendChild(style);

  const modal = document.createElement("div");
  modal.id = "catalogue-image-modal";
  modal.className = "catalogue-image-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Image agrandie");

  const content = document.createElement("div");
  content.className = "catalogue-image-modal-content";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "catalogue-image-modal-close";
  closeButton.setAttribute("aria-label", "Fermer l'image agrandie");
  closeButton.textContent = "×";

  const modalImage = document.createElement("img");
  modalImage.alt = "";

  content.append(closeButton, modalImage);
  modal.appendChild(content);
  document.body.appendChild(modal);

  const closeModal = () => {
    modal.hidden = true;
    modalImage.removeAttribute("src");
    document.body.style.removeProperty("overflow");
  };

  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  window.__catalogueOpenImageModal = (url, alt) => {
    if (!url) return;
    modalImage.src = url;
    modalImage.alt = alt || "";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton.focus();
  };
}

function makeImageClickable(img, alt) {
  if (!img) return;
  setupImageModal();
  img.classList.add("catalogue-image-clickable");
  img.setAttribute("role", "button");
  img.setAttribute("tabindex", "0");
  img.setAttribute("aria-label", `Agrandir l'image${alt ? ` : ${alt}` : ""}`);

  const open = () => window.__catalogueOpenImageModal?.(img.currentSrc || img.src, alt);
  img.addEventListener("click", open);
  img.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
}

function createImageElement(url, className, alt) {
  if (!url || typeof url !== "string" || !url.trim()) return null;

  const img = document.createElement("img");
  img.className = className;
  img.src = url;
  img.alt = alt || "";
  img.loading = "lazy";
  makeImageClickable(img, alt);
  img.addEventListener("error", () => {
    const placeholder = document.createElement("span");
    placeholder.className = `${className}-placeholder`;
    placeholder.textContent = "Aucune image";
    img.replaceWith(placeholder);
  }, { once: true });
  return img;
}

function image(url,name){if(!url)return '<div class="tile-placeholder"></div>';return '<img loading="lazy" src="'+String(url).replace(/"/g,"&quot;")+'" alt="'+String(name||"").replace(/"/g,"&quot;")+'">';}

function tile(f,detail=false){
 const cat=categoryOf(f);
 const href="commande.html?categorie="+encodeURIComponent(cat)+"&formule="+encodeURIComponent(f.id||"");
 const action=detail
   ? '<button type="button" class="btn btn-primary quick-add" data-open-formula="'+escapeHtml(f.id||"")+'">Ajouter au panier</button><a class="btn btn-secondary" href="'+href+'">Voir les détails</a>'
   : '<a class="btn btn-secondary" href="'+href+'">Voir les détails</a>';
 return '<article class="'+(detail?"category-card":"formula-tile")+'">'+image(f.photo,f.nom)+'<div class="'+(detail?"category-card-body":"formula-tile-body")+'"><h'+(detail?"2":"3")+'>'+escapeHtml(f.nom||"Formule")+'</h'+(detail?"2":"3")+'><p class="desc">'+escapeHtml(f.description||"")+'</p><div class="price">'+euro.format(Number(f.prix)||0)+'</div><div class="tile-actions">'+action+'</div></div></article>';
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function productTile(p,index,category){
 const description=String(p.description||"").trim();
 const safeCategory=String(category||p.categorie||"Produit");
 const safeName=escapeHtml(p.nom||"Produit");
 const safeId=escapeHtml(p.id||"");
 const photo=image(p.photo,p.nom);
 return '<article class="formula-tile dish-tile catalogue-product-tile" data-product-id="'+safeId+'" data-product-category="'+escapeHtml(safeCategory)+'">'+
   photo+
   '<div class="formula-tile-body">'+
   '<h3>'+safeName+'</h3>'+
   '<div class="price">'+euro.format(Number(p.prix)||0)+'</div>'+
   (description
     ? '<details class="catalogue-product-description"><summary>En quelques mots</summary><p>'+escapeHtml(description)+'</p></details>'
     : '')+
   '<div class="catalogue-product-cart">'+
   '<div class="catalogue-product-quantity" aria-label="Quantité">'+
   '<button type="button" data-product-minus aria-label="Diminuer '+safeName+'">−</button>'+
   '<output>1</output>'+
   '<button type="button" data-product-plus aria-label="Augmenter '+safeName+'">+</button>'+
   '</div>'+
   '<button type="button" class="btn btn-primary" data-product-add>Ajouter au panier</button>'+
   '</div>'+
   '</div>'+
   '</article>';
}

let dishGalleryItems=[];let dishGalleryIndex=0;
function ensureDishGallery(){
 if(document.querySelector("#dish-gallery-modal")) return;
 const modal=document.createElement("div");modal.id="dish-gallery-modal";modal.className="dish-gallery-modal";modal.hidden=true;
 modal.innerHTML='<div class="dish-gallery-backdrop" data-gallery-close></div><div class="dish-gallery-dialog" role="dialog" aria-modal="true" aria-label="Nos plats à la carte"><button type="button" class="dish-gallery-close" data-gallery-close aria-label="Fermer">×</button><div class="dish-gallery-head"><div><p class="eyebrow">Nos plats à la carte</p><h2>Découvrez tous nos plats</h2></div><span id="dish-gallery-counter"></span></div><div class="dish-gallery-main"><button type="button" class="dish-gallery-arrow" id="dish-gallery-prev" aria-label="Plat précédent">‹</button><div class="dish-gallery-photo"><img id="dish-gallery-image" alt=""><div class="dish-gallery-caption"><strong id="dish-gallery-title"></strong><span id="dish-gallery-price"></span></div></div><button type="button" class="dish-gallery-arrow" id="dish-gallery-next" aria-label="Plat suivant">›</button></div><div class="dish-gallery-thumbs" id="dish-gallery-thumbs"></div></div>';
 document.body.appendChild(modal);
 modal.querySelectorAll("[data-gallery-close]").forEach(el=>el.addEventListener("click",closeDishGallery));
 modal.querySelector("#dish-gallery-prev").addEventListener("click",()=>moveDishGallery(-1));
 modal.querySelector("#dish-gallery-next").addEventListener("click",()=>moveDishGallery(1));
 document.addEventListener("keydown",event=>{if(modal.hidden)return;if(event.key==="Escape")closeDishGallery();if(event.key==="ArrowLeft")moveDishGallery(-1);if(event.key==="ArrowRight")moveDishGallery(1);});
}
function openDishGallery(items,start=0){ensureDishGallery();dishGalleryItems=items;dishGalleryIndex=Math.max(0,Math.min(start,items.length-1));document.querySelector("#dish-gallery-modal").hidden=false;document.body.classList.add("gallery-open");renderDishGallery();}
function closeDishGallery(){const modal=document.querySelector("#dish-gallery-modal");if(!modal)return;modal.hidden=true;document.body.classList.remove("gallery-open");}
function moveDishGallery(delta){if(!dishGalleryItems.length)return;dishGalleryIndex=(dishGalleryIndex+delta+dishGalleryItems.length)%dishGalleryItems.length;renderDishGallery();}
function renderDishGallery(){
 const item=dishGalleryItems[dishGalleryIndex];if(!item)return;
 const img=document.querySelector("#dish-gallery-image");img.src=item.photo||"";img.alt=item.nom||"";
 document.querySelector("#dish-gallery-title").textContent=item.nom||"Plat";
 document.querySelector("#dish-gallery-price").textContent=euro.format(Number(item.prix)||0);
 document.querySelector("#dish-gallery-counter").textContent=(dishGalleryIndex+1)+" / "+dishGalleryItems.length;
 const thumbs=document.querySelector("#dish-gallery-thumbs");thumbs.innerHTML="";
 dishGalleryItems.forEach((p,i)=>{const b=document.createElement("button");b.type="button";b.className="dish-thumb"+(i===dishGalleryIndex?" is-active":"");b.setAttribute("aria-label","Voir "+(p.nom||"plat"));b.innerHTML=image(p.photo,p.nom);b.addEventListener("click",()=>{dishGalleryIndex=i;renderDishGallery();});thumbs.appendChild(b);});
}
function normalize(){data.formules=data.formules.filter(f=>f?.actif!==false).sort((a,b)=>Number(a.ordre||0)-Number(b.ordre||0));}
function renderHome(){
 const host=document.querySelector("#catalogue-sections");
 if(!host)return;
 host.innerHTML="";

 const productSections=[
   {
     category:"Plat",
     title:"Nos plats à la carte",
     description:"Découvrez notre sélection de plats."
   },
   {
     category:"Dessert",
     title:"Nos desserts à la carte",
     description:"Terminez votre repas sur une note gourmande."
   },
   {
     category:"Boisson",
     title:"Nos boissons à la carte",
     description:"Accompagnez votre repas avec la boisson de votre choix."
   }
 ];

 productSections.forEach(({category,title,description})=>{
   const products=data.produits.filter(
     p=>p?.categorie===category&&p?.actif!==false
   );
   if(!products.length)return;

   const sec=document.createElement("section");
   sec.className="catalogue-section";
   sec.innerHTML='<div class="section-heading"><div><h2>'+title+'</h2><p>'+description+'</p></div></div><div class="formula-grid">'+products.map((p,i)=>productTile(p,i,category)).join("")+'</div>';
   host.appendChild(sec);

   sec.querySelectorAll(".catalogue-product-tile").forEach(card=>{
     const productId=card.dataset.productId;
     const product=products.find(p=>String(p.id)===productId);
     if(!product)return;

     const photo=card.querySelector("img");
     if(photo){
       makeImageClickable(photo,product.nom);
     }

     const output=card.querySelector("output");
     let quantity=1;

     const setQuantity=(value)=>{
       quantity=Math.max(1,Math.min(50,parseInt(value,10)||1));
       output.textContent=String(quantity);
     };

     card.querySelector("[data-product-minus]")?.addEventListener("click",(event)=>{
       event.stopPropagation();
       setQuantity(quantity-1);
     });

     card.querySelector("[data-product-plus]")?.addEventListener("click",(event)=>{
       event.stopPropagation();
       setQuantity(quantity+1);
     });

     card.querySelector("[data-product-add]")?.addEventListener("click",(event)=>{
       event.stopPropagation();
       addProductToCart({product,quantite:quantity});
     });
   });
 });

 const chef=data.formules.filter(f=>categoryOf(f)==="chef");
 if(chef.length){
   const sec=document.createElement("section");
   sec.className="catalogue-section";
   sec.innerHTML='<div class="section-heading"><div><h2>Formules du Chef</h2><p>Des formules complètes pour tous les moments.</p></div><a class="section-link" href="commande.html?categorie=chef">Voir toutes les formules →</a></div><div class="formula-grid">'+chef.slice(0,4).map(f=>tile(f)).join("")+'</div>';
   host.appendChild(sec);
 }

 const specialCats=["speciales","petit-dejeuner","brunch","fromages"];
 const special=data.formules.filter(f=>specialCats.includes(categoryOf(f)));
 if(special.length){
   const sec=document.createElement("section");
   sec.className="catalogue-section";
   sec.innerHTML='<div class="section-heading"><div><h2>Formules spéciales</h2><p>Des créations uniques pour les occasions particulières.</p></div><a class="section-link" href="commande.html?categorie=speciales">Voir toutes les formules →</a></div><div class="formula-grid">'+special.slice(0,4).map(f=>categoryOf(f)==="petit-dejeuner"?petitDejeunerTile(f):tile(f)).join("")+'</div>';
   host.appendChild(sec);
 }
}

function renderCategory(){
 const params=new URLSearchParams(location.search);const cat=params.get("categorie");
 if(!cat)return;
 document.querySelector("#catalogue-home").hidden=true;document.querySelector("#category-view").hidden=false;
 const socialBanner=document.querySelector(".catalogue-social-banner");if(socialBanner)socialBanner.hidden=true;
 const info=labels[cat]||{title:"Catalogue",description:""};
 const title=document.querySelector("#category-title");
 const description=document.querySelector("#category-description");
 if(title) title.textContent=info.title;
 if(description) description.textContent=info.description;
 const items=data.formules.filter(f=>categoryOf(f)===cat);
 const grid=document.querySelector("#category-grid");
 grid.innerHTML=items.length?items.map(f=>categoryOf(f)==="petit-dejeuner"?petitDejeunerTile(f,true):tile(f,true)).join(""):'<p class="catalogue-empty">Aucune formule disponible dans cette catégorie.</p>';
 const quick=grid.querySelectorAll("[data-open-formula]");
 quick.forEach(button=>button.addEventListener("click",()=>{ const f=items.find(x=>x.id===button.dataset.openFormula); renderFormulaDetail(f); document.querySelector("#formula-detail")?.scrollIntoView({behavior:"smooth",block:"center"}); }));
 const selected=params.get("formule");
 if(selected) renderFormulaDetail(items.find(f=>f.id===selected));
 }
function renderProductOptions(select, category, previewContainer, forcedProductId = "", allowedProductIds = []) {
  const categoryProducts = productsByCategory.get(category) || [];
  const allowedIds = new Set(
    Array.isArray(allowedProductIds)
      ? allowedProductIds.map((id) => String(id))
      : []
  );
  const products = allowedIds.size
    ? categoryProducts.filter((product) => allowedIds.has(String(product.id)))
    : [];
  select.innerHTML = "";
  previewContainer.innerHTML = "";

  if (!products.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucun produit disponible";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  if (forcedProductId) {
    const forcedProduct = products.find((product) => product.id === forcedProductId);

    if (!forcedProduct) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Produit imposé indisponible";
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    const option = document.createElement("option");
    option.value = forcedProduct.id;
    option.textContent = forcedProduct.nom;
    select.appendChild(option);
    select.value = forcedProduct.id;
    select.disabled = true;

    const image = createImageElement(
      forcedProduct.photo,
      "product-photo",
      forcedProduct.nom
    );

    if (image) {
      previewContainer.appendChild(image);
    } else {
      const placeholderImage = document.createElement("span");
      placeholderImage.className = "product-photo-placeholder";
      placeholderImage.textContent = "Aucune image";
      previewContainer.appendChild(placeholderImage);
    }

    return;
  }

  select.disabled = false;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = `Choisir un ${category.toLowerCase()}`;
  placeholder.selected = true;
  placeholder.disabled = true;
  select.appendChild(placeholder);

  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id || "";
    option.textContent = product.nom;
    option.disabled = !product.id;
    if (!product.id) option.textContent += " — identifiant indisponible";
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    previewContainer.innerHTML = "";

    previewContainer.parentElement
      ?.querySelectorAll(".product-description-details")
      .forEach((el) => el.remove());

    const product = products.find((item) => item.id === select.value);
    if (!product) return;

    const image = createImageElement(
      product.photo,
      "product-photo",
      product.nom
    );

    if (image) {
      previewContainer.appendChild(image);
    } else {
      const placeholderImage = document.createElement("span");
      placeholderImage.className = "product-photo-placeholder";
      placeholderImage.textContent = "Aucune image";
      previewContainer.appendChild(placeholderImage);
    }

    if (product.description?.trim()) {
      const details = document.createElement("details");
      details.className = "product-description-details";
      const summary = document.createElement("summary");
      summary.textContent = "En quelques mots";
      const description = document.createElement("p");
      description.textContent = product.description.trim();
      details.append(summary, description);
      previewContainer.parentElement?.appendChild(details);
    }
  });
}


function petitDejeunerElementName(elementId){
 const element=(data.petitDejeunerElements||[]).find(x=>x.id===elementId);
 return element?.nom||elementId||"Élément";
}

function petitDejeunerTile(f,detail=false){
 const href="commande.html?categorie=petit-dejeuner&formule="+encodeURIComponent(f.id||"");
 const action=detail
   ? '<a class="btn btn-secondary" href="'+href+'">Voir les détails</a>'
   : '<a class="btn btn-secondary" href="'+href+'">Voir les détails</a>';
 return '<article class="'+(detail?"category-card":"formula-tile")+'">'+image(f.photo,f.nom)+'<div class="'+(detail?"category-card-body":"formula-tile-body")+'"><h'+(detail?"2":"3")+'>'+escapeHtml(f.nom||"Petit Déjeuner du Chef")+'</h'+(detail?"2":"3")+'><p class="desc">'+escapeHtml(f.description||"")+'</p><div class="price">'+(Array.isArray(f.formats)&&f.formats.length?euro.format(Number(f.formats[0]?.prix)||0):"Sur mesure")+'</div><div class="tile-actions">'+action+'</div></div></article>';
}

function renderPetitDejeunerDetail(formule){
 const old=document.querySelector("#formula-detail");old?.remove();
 if(!formule)return;

 const section=document.createElement("section");
 section.id="formula-detail";
 section.className="formula-detail";

 const formats=Array.isArray(formule.formats)?formule.formats.filter(x=>x):[];

 section.innerHTML='<div class="formula-detail-image">'+image(formule.photo,formule.nom)+'</div><div><p class="eyebrow">Petit déjeuner</p><h2>'+escapeHtml(formule.nom||"Petit Déjeuner du Chef")+'</h2><p class="detail-description">'+escapeHtml(formule.description||"")+'</p><div class="detail-composition"></div></div>';

 document.querySelector("#category-grid")?.before(section);

 const comp=section.querySelector(".detail-composition");

 if(!formats.length){
   comp.innerHTML='<p class="catalogue-empty">Aucun format disponible pour le moment.</p>';
   return;
 }

 comp.innerHTML='<div class="pdj-formats">'+formats.map((format,index)=>{
   const composition=Array.isArray(format.composition)?format.composition.filter(x=>Number(x.quantite)>0):[];
   const elements=composition.map(item=>{
     const qty=Number(item.quantite)||0;
     return '<li>'+escapeHtml(petitDejeunerElementName(item.elementId))+(qty>1?' × '+qty:'')+'</li>';
   }).join("");

   return '<article class="pdj-format"><h3>'+escapeHtml(format.nom||"Format")+'</h3><p>'+Number(format.personnes||1)+' personne'+(Number(format.personnes||1)>1?"s":"")+'</p><ul>'+elements+'</ul><div class="price">'+euro.format(Number(format.prix)||0)+'</div><button type="button" class="btn btn-primary" data-pdj-add-format="'+index+'">Ajouter au panier</button></article>';
 }).join("")+'</div>';

  comp.querySelectorAll("[data-pdj-add-format]").forEach((button)=>{
    button.addEventListener("click",()=>{
      const index=Number(button.dataset.pdjAddFormat);
      const format=formats[index];
      if(!format)return;

      const composition=Array.isArray(format.composition)
        ? format.composition.filter(x=>Number(x.quantite)>0)
        : [];

      const enrichedFormat={
        ...format,
        composition:composition.map(item=>({
          ...item,
          elementNom:petitDejeunerElementName(item.elementId)
        }))
      };

      addPetitDejeunerToCart({
        formule,
        format:enrichedFormat,
        quantite:1
      });
    });
  });
}

function renderFormulaDetail(formule){
 if(categoryOf(formule)==="petit-dejeuner"){
  renderPetitDejeunerDetail(formule);
  return;
 }


 const old=document.querySelector("#formula-detail");old?.remove();
 if(!formule)return;
 const section=document.createElement("section");section.id="formula-detail";section.className="formula-detail";
 const composition=Array.isArray(formule.composition)?formule.composition.filter(x=>Number(x.quantite)>0):[];
 section.innerHTML='<div class="formula-detail-image">'+image(formule.photo,formule.nom)+'</div><div><p class="eyebrow">Votre sélection</p><h2>'+escapeHtml(formule.nom)+'</h2><p class="detail-description">'+escapeHtml(formule.description||"")+'</p><div class="detail-composition"></div><div class="detail-quantity"><strong>Quantité</strong><button type="button" data-detail-minus>−</button><output>1</output><button type="button" data-detail-plus>+</button></div><button type="button" class="btn btn-primary" data-detail-add>Ajouter au panier</button></div>';
 document.querySelector("#category-grid")?.before(section);
 const comp=section.querySelector(".detail-composition");
 composition.forEach(item=>{

  const row=document.createElement("div");
  row.className="component-row";

  const label=document.createElement("label");
  const select=document.createElement("select");
  const preview=document.createElement("div");

  const selectId=`component-${formule.id || formule.nom}-${item.categorie}`;
  label.htmlFor=selectId;
  label.textContent=(item.categorie==="Plat"?"Plat":item.categorie==="Boisson"?"Boisson":"Dessert")+" × "+item.quantite;

  select.id=selectId;
  select.dataset.category=item.categorie;
  select.dataset.requiredQuantity=String(item.quantite);
  preview.className="product-photo-preview";

  const rawCompositionItem=Array.isArray(formule.composition)
    ? formule.composition.find(x=>x?.categorie===item.categorie)
    : null;

  const imposedProductId=String(rawCompositionItem?.produitId || item.produitId || "");

  const allowedProductIds = Array.isArray(rawCompositionItem?.produitsAutorises)
    ? rawCompositionItem.produitsAutorises
        .map((entry) => String(entry?.produitId || ""))
        .filter(Boolean)
    : [];

  renderProductOptions(
    select,
    item.categorie,
    preview,
    imposedProductId,
    allowedProductIds
  );

  if(imposedProductId){
    const imposedProduct=(productsByCategory.get(item.categorie)||[]).find(
      product=>product.id===imposedProductId
    );

    if(imposedProduct){
      select.innerHTML="";
      const option=document.createElement("option");
      option.value=imposedProduct.id;
      option.textContent=imposedProduct.nom;
      option.selected=true;
      select.appendChild(option);
      select.value=imposedProduct.id;
    }

    select.disabled=true;
    select.setAttribute("aria-disabled","true");
    select.dispatchEvent(new Event("change"));
  }

  row.append(label,select,preview);

  if(imposedProductId){
    const imposedProduct=(productsByCategory.get(item.categorie)||[]).find(
      product=>product.id===imposedProductId
    );

    if(imposedProduct?.description?.trim()){
      const details=document.createElement("details");
      details.className="product-description-details";

      const summary=document.createElement("summary");
      summary.textContent="En quelques mots";

      const description=document.createElement("p");
      description.textContent=imposedProduct.description.trim();

      details.append(summary,description);
      row.appendChild(details);
    }
  }
  comp.appendChild(row);

});
 let qty=1;const out=section.querySelector("output");const setQ=v=>{qty=Math.max(1,parseInt(v,10)||1);out.textContent=qty};
 section.querySelector("[data-detail-minus]").onclick=()=>setQ(qty-1);section.querySelector("[data-detail-plus]").onclick=()=>setQ(qty+1);
 section.querySelector("[data-detail-add]").onclick=()=>{
   const composants=[];
   for(const select of comp.querySelectorAll("select")){
     if(!select.value){select.focus();return;}
     const p=(productsByCategory.get(select.dataset.category)||[]).find(x=>x.id===select.value);
     if(!p)return;
     composants.push({categorie:select.dataset.category,produitId:p.id,produitNom:p.nom,quantiteParFormule:Number(select.dataset.requiredQuantity)||1});
   }
   addToCart({formule,quantite:qty,composants});
 };
}
function renderSideCart(){
 const cart=getCart(),lines=document.querySelector("#category-cart-lines");if(!lines)return;
 const lineMarkup=line=>{
   const name=line.type==="produit"?String(line.produitNom||line.formuleNom||"Produit"):String(line.formuleNom||"Formule");
   const components=line.type==="produit"
     ?"À la carte · "+String(line.categorie||"Produit")
     :line.type==="petit-dejeuner"
       ?String(line.formatNom||"Format")+" · "+String(Number(line.personnes)||1)+" personne"+((Number(line.personnes)||1)>1?"s":"")+" · "+(line.composants||[]).map(x=>String(x.elementNom||x.elementId||"Élément")+(Number(x.quantiteParFormat)>1?" × "+Number(x.quantiteParFormat):"")).join(" · ")
       :(line.composants||[]).map(x=>x.categorie+" : "+x.produitNom+" × "+x.quantiteParFormule).join(" · ");
   return '<article class="cart-line"><div class="cart-line-title"><span>'+escapeHtml(name)+' × '+line.quantite+'</span><span>'+euro.format((Number(line.prixUnitaire)||0)*line.quantite)+'</span></div><div class="cart-components">'+escapeHtml(components)+'</div><div class="cart-actions"><button data-minus="'+line.lineId+'">−</button><strong>'+line.quantite+'</strong><button data-plus="'+line.lineId+'">+</button><button data-remove="'+line.lineId+'">Supprimer</button></div></article>';
 };
 lines.innerHTML=cart.lines.map(lineMarkup).join("");
 document.querySelector("#category-cart-empty").hidden=cart.lines.length>0;document.querySelector("#category-cart-total").textContent=euro.format(getCartTotal());document.querySelector("#category-pay").disabled=!cart.lines.length;
 lines.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>updateLineQuantity(b.dataset.minus,cart.lines.find(x=>x.lineId===b.dataset.minus).quantite-1));
 lines.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>updateLineQuantity(b.dataset.plus,cart.lines.find(x=>x.lineId===b.dataset.plus).quantite+1));
 lines.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeLine(b.dataset.remove));
}
function renderFullCart(){
 const cart=getCart(),lines=document.querySelector("#full-cart-lines");if(!lines)return;
 const lineMarkup=line=>{
   const name=line.type==="produit"?String(line.produitNom||line.formuleNom||"Produit"):String(line.formuleNom||"Formule");
   const components=line.type==="produit"
     ?"À la carte · "+String(line.categorie||"Produit")
     :line.type==="petit-dejeuner"
       ?String(line.formatNom||"Format")+" · "+String(Number(line.personnes)||1)+" personne"+((Number(line.personnes)||1)>1?"s":"")+" · "+(line.composants||[]).map(x=>String(x.elementNom||x.elementId||"Élément")+(Number(x.quantiteParFormat)>1?" × "+Number(x.quantiteParFormat):"")).join(" · ")
       :(line.composants||[]).map(x=>x.categorie+" : "+x.produitNom+" × "+x.quantiteParFormule).join(" · ");
   return '<article class="cart-line"><div class="cart-line-title"><span>'+escapeHtml(name)+' × '+line.quantite+'</span><span>'+euro.format((Number(line.prixUnitaire)||0)*line.quantite)+'</span></div><div class="cart-components">'+escapeHtml(components)+'</div><div class="cart-actions"><button data-minus="'+line.lineId+'">−</button><strong>'+line.quantite+'</strong><button data-plus="'+line.lineId+'">+</button><button data-remove="'+line.lineId+'">Supprimer</button></div></article>';
 };
 lines.innerHTML=cart.lines.map(lineMarkup).join("");
 document.querySelector("#full-cart-empty").hidden=cart.lines.length>0;document.querySelector("#full-cart-total").textContent=euro.format(getCartTotal());document.querySelector("#full-cart-pay").disabled=!cart.lines.length;
 lines.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>updateLineQuantity(b.dataset.minus,getCart().lines.find(x=>x.lineId===b.dataset.minus).quantite-1));
 lines.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>updateLineQuantity(b.dataset.plus,getCart().lines.find(x=>x.lineId===b.dataset.plus).quantite+1));
 lines.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeLine(b.dataset.remove));
}
function pay(){if(getCart().lines.length)location.href="validation-commande.html";}
async function load(){
 try{
  const r=await fetch(GET_CATALOGUE_URL,{cache:"no-store"});if(!r.ok)throw new Error();
  data=await r.json();normalize();
  if(!Array.isArray(data.formules)||!Array.isArray(data.produits)||!Array.isArray(data.petitDejeunerElements))throw new Error();
  productsByCategory=new Map();
  data.produits.filter(p=>p?.actif!==false).forEach(p=>{
    const category=String(p.categorie||"").trim();
    if(!category)return;
    if(!productsByCategory.has(category))productsByCategory.set(category,[]);
    productsByCategory.get(category).push(p);
  });
  renderHome();renderCategory();renderFullCart();
  document.querySelector("#catalogue-status")?.remove();
 }catch(e){const s=document.querySelector("#catalogue-status");if(s)s.textContent="Le catalogue ne peut pas être chargé pour le moment.";}
}
document.querySelector("#category-pay")?.addEventListener("click",pay);
document.querySelector("#full-cart-pay")?.addEventListener("click",pay);
window.addEventListener("cdc-cart-updated",()=>{renderSideCart();renderFullCart();});
window.addEventListener("storage",e=>{if(e.key==="cdc-panier-v1"){renderSideCart();renderFullCart();}});
load();
