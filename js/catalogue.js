import { addToCart, getCart, removeLine, updateLineQuantity, getCartTotal } from "./panier.js";

const GET_CATALOGUE_URL="https://europe-west9-carnet-du-chef.cloudfunctions.net/getCatalogue";
const euro=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
const labels={
 chef:{title:"Formules du Chef",description:"Des formules complètes pour tous les moments."},
 speciales:{title:"Formules spéciales",description:"Des créations uniques pour les occasions particulières."},
 "petit-dejeuner":{title:"Petit déjeuner",description:"Un réveil gourmand."},
 brunch:{title:"Formule Brunch",description:"La pause conviviale."},
 fromages:{title:"Plateaux de fromages",description:"Une sélection raffinée."}
};
let data={formules:[],produits:[]};
let productsByCategory=new Map();

function categoryOf(f){return f.categorieFormule||"chef";}
function image(url,name){if(!url)return '<div class="tile-placeholder"></div>';return '<img loading="lazy" src="'+String(url).replace(/"/g,"&quot;")+'" alt="'+String(name||"").replace(/"/g,"&quot;")+'">';}
function tile(f,detail=false){
 const cat=categoryOf(f);
 const href="commande.html?categorie="+encodeURIComponent(cat)+"&formule="+encodeURIComponent(f.id||"");
 return '<article class="'+(detail?"category-card":"formula-tile")+'">'+image(f.photo,f.nom)+'<div class="'+(detail?"category-card-body":"formula-tile-body")+'"><h'+(detail?"2":"3")+'>'+escapeHtml(f.nom||"Formule")+'</h'+(detail?"2":"3")+'><p class="desc">'+escapeHtml(f.description||"")+'</p><div class="price">'+euro.format(Number(f.prix)||0)+'</div><div class="tile-actions"><a class="btn btn-secondary" href="'+href+'">Voir les détails</a></div></div></article>';
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function normalize(){data.formules=data.formules.filter(f=>f?.actif!==false).sort((a,b)=>Number(a.ordre||0)-Number(b.ordre||0));}
function renderHome(){
 const host=document.querySelector("#catalogue-sections"); if(!host)return;
 host.innerHTML="";
 const chef=data.formules.filter(f=>categoryOf(f)==="chef");
 if(chef.length){
   const sec=document.createElement("section");sec.className="catalogue-section";
   sec.innerHTML='<div class="section-heading"><div><h2>Formules du Chef</h2><p>Des formules complètes pour tous les moments.</p></div><a class="section-link" href="commande.html?categorie=chef">Voir toutes les formules →</a></div><div class="formula-grid">'+chef.slice(0,4).map(f=>tile(f)).join("")+'</div>';
   host.appendChild(sec);
 }
 const specialCats=["speciales","petit-dejeuner","brunch","fromages"];
 const special=data.formules.filter(f=>specialCats.includes(categoryOf(f)));
 if(special.length){
   const sec=document.createElement("section");sec.className="catalogue-section";
   sec.innerHTML='<div class="section-heading"><div><h2>Formules spéciales</h2><p>Des créations uniques pour les occasions particulières.</p></div><a class="section-link" href="commande.html?categorie=speciales">Voir toutes les formules →</a></div><div class="formula-grid">'+special.slice(0,4).map(f=>tile(f)).join("")+'</div>';
   host.appendChild(sec);
 }
 const plats=data.produits.filter(p=>p?.categorie==="Plat"&&p?.actif!==false).slice(0,4);
 if(plats.length){
   const sec=document.createElement("section");sec.className="catalogue-section";
   sec.innerHTML='<div class="section-heading"><div><h2>Nos plats à la carte</h2><p>Découvrez notre sélection de plats.</p></div><span class="section-link">Voir tous les plats →</span></div><div class="formula-grid">'+plats.map(p=>'<article class="formula-tile">'+image(p.photo,p.nom)+'<div class="formula-tile-body"><h3>'+escapeHtml(p.nom)+'</h3><div class="price">'+euro.format(Number(p.prix)||0)+'</div></div></article>').join("")+'</div>';
   host.appendChild(sec);
 }
}
function renderCategory(){
 const params=new URLSearchParams(location.search);const cat=params.get("categorie");
 if(!cat)return;
 document.querySelector("#catalogue-home").hidden=true;document.querySelector("#category-view").hidden=false;
 const info=labels[cat]||{title:"Catalogue",description:""};
 document.querySelector("#category-title").textContent=info.title;
 document.querySelector("#category-description").textContent=info.description;
 document.querySelector("#category-breadcrumb").textContent=info.title;
 const items=data.formules.filter(f=>categoryOf(f)===cat);
 const grid=document.querySelector("#category-grid");
 grid.innerHTML=items.length?items.map(f=>tile(f,true)).join(""):'<p class="catalogue-empty">Aucune formule disponible dans cette catégorie.</p>';
 const selected=params.get("formule");
 if(selected) renderFormulaDetail(items.find(f=>f.id===selected));
 renderSideCart();
}
function renderFormulaDetail(formule){
 const old=document.querySelector("#formula-detail");old?.remove();
 if(!formule)return;
 const section=document.createElement("section");section.id="formula-detail";section.className="formula-detail";
 const composition=Array.isArray(formule.composition)?formule.composition.filter(x=>Number(x.quantite)>0):[];
 section.innerHTML='<div class="formula-detail-image">'+image(formule.photo,formule.nom)+'</div><div><p class="eyebrow">Votre sélection</p><h2>'+escapeHtml(formule.nom)+'</h2><p class="detail-description">'+escapeHtml(formule.description||"")+'</p><div class="detail-composition"></div><div class="detail-quantity"><strong>Quantité</strong><button type="button" data-detail-minus>−</button><output>1</output><button type="button" data-detail-plus>+</button></div><button type="button" class="btn btn-primary" data-detail-add>Ajouter au panier</button></div>';
 document.querySelector("#category-grid")?.before(section);
 const comp=section.querySelector(".detail-composition");
 composition.forEach(item=>{
   const row=document.createElement("label");row.className="detail-component";
   const name=document.createElement("span");name.textContent=(item.categorie==="Plat"?"Plat":item.categorie==="Boisson"?"Boisson":"Dessert")+" × "+item.quantite;
   const select=document.createElement("select");select.dataset.category=item.categorie;select.dataset.requiredQuantity=item.quantite;
   const products=productsByCategory.get(item.categorie)||[];
   const forced=item.produitId||"";
   if(forced){
     const p=products.find(x=>x.id===forced);select.innerHTML='<option value="'+forced+'">'+escapeHtml(p?.nom||item.produitNom||"Produit imposé")+'</option>';select.disabled=true;
   }else{
     select.innerHTML='<option value="">Choisir un '+item.categorie.toLowerCase()+'</option>'+products.map(p=>'<option value="'+p.id+'">'+escapeHtml(p.nom)+'</option>').join("");
   }
   row.append(name,select);comp.appendChild(row);
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
 lines.innerHTML=cart.lines.map(line=>'<article class="cart-line"><div class="cart-line-title"><span>'+escapeHtml(line.formuleNom)+' × '+line.quantite+'</span><span>'+euro.format((Number(line.prixUnitaire)||0)*line.quantite)+'</span></div><div class="cart-components">'+escapeHtml((line.composants||[]).map(x=>x.categorie+" : "+x.produitNom+" × "+x.quantiteParFormule).join(" · "))+'</div><div class="cart-actions"><button data-minus="'+line.lineId+'">−</button><strong>'+line.quantite+'</strong><button data-plus="'+line.lineId+'">+</button><button data-remove="'+line.lineId+'">Supprimer</button></div></article>').join("");
 document.querySelector("#category-cart-empty").hidden=cart.lines.length>0;document.querySelector("#category-cart-total").textContent=euro.format(getCartTotal());document.querySelector("#category-pay").disabled=!cart.lines.length;
 lines.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>updateLineQuantity(b.dataset.minus,cart.lines.find(x=>x.lineId===b.dataset.minus).quantite-1));
 lines.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>updateLineQuantity(b.dataset.plus,cart.lines.find(x=>x.lineId===b.dataset.plus).quantite+1));
 lines.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeLine(b.dataset.remove));
}
function renderFullCart(){
 const cart=getCart(),lines=document.querySelector("#full-cart-lines");if(!lines)return;
 lines.innerHTML=cart.lines.map(line=>'<article class="cart-line"><div class="cart-line-title"><span>'+escapeHtml(line.formuleNom)+' × '+line.quantite+'</span><span>'+euro.format((Number(line.prixUnitaire)||0)*line.quantite)+'</span></div><div class="cart-components">'+escapeHtml((line.composants||[]).map(x=>x.categorie+" : "+x.produitNom+" × "+x.quantiteParFormule).join(" · "))+'</div><div class="cart-actions"><button data-minus="'+line.lineId+'">−</button><strong>'+line.quantite+'</strong><button data-plus="'+line.lineId+'">+</button><button data-remove="'+line.lineId+'">Supprimer</button></div></article>').join("");
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
  if(!Array.isArray(data.formules)||!Array.isArray(data.produits))throw new Error();
  renderHome();renderCategory();renderFullCart();
  document.querySelector("#catalogue-status")?.remove();
 }catch(e){const s=document.querySelector("#catalogue-status");if(s)s.textContent="Le catalogue ne peut pas être chargé pour le moment.";}
}
document.querySelector("#category-pay")?.addEventListener("click",pay);
document.querySelector("#full-cart-pay")?.addEventListener("click",pay);
window.addEventListener("cdc-cart-updated",()=>{renderSideCart();renderFullCart();});
window.addEventListener("storage",e=>{if(e.key==="cdc-panier-v1"){renderSideCart();renderFullCart();}});
load();