import {state,$,esc,icon,api,toast,empty,card,dialog,closeDialog} from './lib.js';
import {header,footer,home,catalog,detail,info,how,faq,favorites} from './pages.js';
import {openBooking} from './booking.js';
import {openAuth,dashboard,bindDashboard,accountAction} from './account.js';

import {toggleFavorite, favoriteCount, hasFavorite, syncFavorites, FAVORITES_KEY} from './favorites.js';

let routeTicket=0;
function renderHeader(){ $('#header').innerHTML=header(); const current=(location.hash.slice(1)||'/').split('?')[0]; document.querySelectorAll('.desktop-nav a,.favorites-link').forEach(a=>{const active=a.getAttribute('href')==='#'+current;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');}); }
async function refreshData(){
  const [services,categories,reviews]=await Promise.all([api('/services'),api('/categories'),api('/reviews/latest')]);
  state.services=services;state.categories=categories;state.reviews=reviews;
}
function bindCatalog(params){
  const form=$('#filters');$('#min-rating').value=params.get('minRating')||'';
  let timer;
  function update(){
    const values=Object.fromEntries(new FormData(form));let list=state.services.filter(s=>
      (!values.category||s.category===values.category)&&(!values.city||s.city===values.city)&&
      (!values.search||s.title.toLocaleLowerCase('ru').includes(values.search.trim().toLocaleLowerCase('ru')))&&
      (!values.maxPrice||s.price<=Number(values.maxPrice))&&(!values.minRating||s.rating>=Number(values.minRating)));
    const sort=$('#sort').value;if(sort==='price')list.sort((a,b)=>a.price-b.price);if(sort==='rating')list.sort((a,b)=>b.rating-a.rating);
    $('#result-count').textContent=`Найдено предложений: ${list.length}`;
    $('#catalog-results').innerHTML=list.map(card).join('')||empty('Ничего не нашлось','Измените фильтры или попробуйте другой запрос.');
    const query=new URLSearchParams(Object.entries(values).filter(([,v])=>v));history.replaceState(null,'','#/services'+(query.size?'?'+query:''));
  }
  form.oninput=()=>{clearTimeout(timer);timer=setTimeout(update,120);};form.onchange=update;
  form.onsubmit=e=>e.preventDefault();form.onreset=()=>{setTimeout(()=>{for(const el of form.elements)if(el.name)el.value='';update();},0);};$('#sort').onchange=update;update();
}
async function route(){
  const ticket=++routeTicket;const [path,query='']=(location.hash.slice(1)||'/').split('?');const params=new URLSearchParams(query);
  closeDialog();$('#main').innerHTML='<div class="container loading"><span class="spinner"></span><p>Загружаем…</p></div>';
  try{
    let html;
    if(path==='/services'||path==='/catalog')html=catalog(params);
    else if(/^\/services\/\d+$/.test(path))html=detail(await api('/services/'+path.split('/')[2]));
    else if(path==='/favorites')html=favorites();
    else if(path==='/account')html=await dashboard(params.get('tab')||'orders');
    else if(path==='/about'||path==='/terms'||path==='/privacy')html=info(path.slice(1));
    else if(path==='/how')html=`<div class="container section">${how()}</div>`;
    else if(path==='/faq')html=`<div class="container">${faq()}</div>`;
    else if(path==='/')html=home();
    else html=`<div class="container section">${empty('Такой страницы нет','Вернитесь в каталог — там найдётся что-то подходящее.','<a class="btn" href="#/services">Открыть каталог</a>')}</div>`;
    if(ticket!==routeTicket)return;$('#main').innerHTML=html;
    document.title=(path==='/services'?'Услуги':path==='/favorites'?'Избранное':path==='/account'?'Личный кабинет':'Дома становится легче')+' — CleanLink';
    if(path==='/services'||path==='/catalog')bindCatalog(params);
    if(path==='/account')bindDashboard();
    const quick=$('#quick-search');if(quick)quick.onsubmit=e=>{e.preventDefault();location.hash='/services?'+new URLSearchParams(new FormData(quick));};
    window.scrollTo({top:0,behavior:'instant'});renderHeader();
  }catch(error){if(ticket!==routeTicket)return;$('#main').innerHTML=`<div class="container section">${empty(error.status===404?'Услуга не найдена':'Не удалось загрузить страницу',error.message,'<button class="btn" data-action="retry">Попробовать снова</button>')}</div>`;}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;const d=button.dataset;
  try{
    if(d.action==='favorite'){const result=toggleFavorite(Number(d.id));updateFavoriteUI();toast(result.saved?(result.active?'Услуга добавлена в избранное':'Услуга удалена из избранного'):'Список изменён, но браузер не разрешил сохранить его после закрытия страницы.',!result.saved);return;}
    if(d.action==='close'){closeDialog();return;}
    if(d.action==='login'){openAuth(false);return;}
    if(d.action==='register'){openAuth(true);return;}
    if(d.action==='join'){if(state.user){location.hash='/account';toast(state.user.role==='user'?'Для работы клинером зарегистрируйте отдельный профиль исполнителя.':'Управляйте услугами в своём кабинете.');}else openAuth(true,true);return;}
    if(d.action==='book'){await openBooking(Number(d.id));return;}
    if(d.action==='menu'){const menu=$('#mobile-menu');menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));return;}
    if(d.action==='retry'){await refreshData();await route();return;}
    if(d.action==='notifications'){
      state.notifications=await api('/notifications');
      dialog('Что нового', 'Обновления по вашим заказам',state.notifications.length?state.notifications.map(n=>`<div class="notification ${n.isRead?'':'unread'}">${esc(n.message)}<time>${new Date(n.createdAt).toLocaleString('ru-RU',{timeZone:'Asia/Almaty'})}</time></div>`).join(''):empty('Пока без новостей','Подтверждения и изменения заказов появятся здесь.'));
      await api('/notifications/read',{method:'PATCH',body:{}});state.notifications.forEach(n=>n.isRead=true);renderHeader();return;
    }
    await accountAction(d.action,d);
  }catch(error){toast(error.message,true);}
});
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
function updateFavoriteUI(){
  document.querySelectorAll('[data-action="favorite"]').forEach(button=>{const active=hasFavorite(Number(button.dataset.id));button.classList.toggle('is-favorite',active);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Удалить из избранного':'Добавить в избранное');button.title=active?'Удалить из избранного':'Добавить в избранное';});
  document.querySelectorAll('.favorite-count').forEach(el=>{el.textContent=favoriteCount();el.hidden=!favoriteCount();});
  if((location.hash.split('?')[0])==='#/favorites'){const focused=document.activeElement;const id=focused?.dataset?.id;$('#main').innerHTML=favorites();if(id){const next=$('[data-action="favorite"]')||$('.favorites-page .btn');next?.focus();}}
}
window.addEventListener('storage',event=>{if(event.key===FAVORITES_KEY||event.key===null){syncFavorites();updateFavoriteUI();}});
window.addEventListener('hashchange',route);
window.addEventListener('login-needed',event=>openAuth(false,false,()=>openBooking(event.detail)));
window.addEventListener('user-changed',async()=>{renderHeader();try{if(state.user)state.notifications=await api('/notifications');renderHeader();}catch{}});
window.addEventListener('refresh-page',async()=>{try{await refreshData();await route();}catch(error){toast(error.message,true);}});
async function notifications(){if(!state.user||document.hidden)return;try{state.notifications=await api('/notifications');renderHeader();}catch(error){if(error.status===401){state.user=null;state.csrf='';renderHeader();}}}
async function init(){
  renderHeader();$('#footer').innerHTML=footer();
  try{
    state.settings=await api('/config');
    if(state.settings.demo){const banner=$('#demo-banner');banner.hidden=false;banner.className='demo-banner';banner.textContent='Демонстрационный режим · В каталоге есть учебные услуги и отзывы.';}
    try{const session=await api('/auth/me');state.user=session.user;state.csrf=session.csrf;}catch(error){if(error.status!==401)throw error;}
    await refreshData();await notifications();await route();setInterval(notifications,30000);
  }catch(error){$('#main').innerHTML=`<div class="container section">${empty('Не удалось подключиться',error.message,'<button class="btn" data-action="retry">Повторить</button>')}</div>`;}
}
init();
