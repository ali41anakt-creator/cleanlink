import {favoriteButton} from './favorites.js';
export const state = { user:null, csrf:'', categories:[], services:[], settings:{extras:[]}, notifications:[] };
export const $ = (selector, parent=document) => parent.querySelector(selector);
export const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => `${Number(value || 0).toLocaleString('ru-RU')} ₸`;
export const minutes = value => `${Math.floor(value / 60) ? Math.floor(value / 60)+' ч' : ''}${value % 60 ? ' '+value % 60+' мин' : ''}`.trim();
export const dateLabel = value => new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(value));
export const dayString = (offset=0) => new Date(Date.now()+5*3600000+offset*86400000).toISOString().slice(0,10);
export const categoryName = slug => state.categories.find(c=>c.slug===slug)?.name || 'Уборка';
export const statusLabel = { pending:'Ожидает подтверждения',confirmed:'Подтверждён',completed:'Выполнен',cancelled:'Отменён',verified:'Проверен',rejected:'Отклонён',not_required:'Клиент' };
const paths = {
  home:'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7',arrow:'M5 12h14m-6-6 6 6-6 6',chevron:'m9 5 7 7-7 7',
  check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',menu:'M4 6h16M4 12h16M4 18h16',
  pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',star:'m12 3 2.8 5.7L21 9.6l-4.5 4.4 1 6.3-5.5-3-5.5 3 1-6.3L3 9.6l6.2-.9Z',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6',search:'M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 5 6',
  sparkles:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z',calendar:'M5 5h14v16H5ZM8 2v6m8-6v6M5 10h14',
  wallet:'M3 6h17v14H3ZM3 6l14-3v3m-2 6h6v5h-6Z',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3',
  bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4',logout:'M9 4H4v16h5m5-13 5 5-5 5m-7-5h12',
  plus:'M12 4v16M4 12h16',edit:'m15 4 5 5M4 20l1-5L17 3l4 4L9 19Z',building:'M5 21V3h14v18M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3',
  window:'M4 3h16v18H4ZM12 3v18M4 12h16',oven:'M4 3h16v18H4ZM4 8h16M8 5h1m5 0h2M8 12h8v5H8Z',
  fridge:'M6 3h12v18H6ZM6 10h12M9 6v1m0 6v3',sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M20 4l-2 2M6 18l-2 2',
  leaf:'M20 3C6 1 0 14 8 19S24 15 20 3ZM6 21 17 8',brush:'m5 16 9-12 5 4-9 12ZM5 16l5 4-3 2H2Z',heart:'M20 5c-4-4-8 1-8 1s-4-5-8-1 0 10 8 16C20 15 24 9 20 5Z',
};
export const icon = (name,extra='') => `<svg class="icon ${extra}" aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name]||paths.sparkles}"/></svg>`;
export async function api(path, options={}) {
  const headers = { ...(options.body?{'Content-Type':'application/json'}:{}), ...(state.csrf?{'X-CSRF-Token':state.csrf}:{}), ...options.headers };
  const response = await fetch('/api'+path,{...options,headers,credentials:'same-origin',body:options.body?JSON.stringify(options.body):undefined});
  const data = await response.json().catch(()=>({error:'Сервер вернул некорректный ответ'}));
  if(!response.ok){ const error=new Error(data.error||'Не удалось выполнить запрос');error.status=response.status;throw error; }
  return data;
}
export function toast(message,error=false) {
  const element=document.createElement('div');element.className='toast'+(error?' error':'');element.textContent=message;$('#toasts').append(element);setTimeout(()=>element.remove(),6000);
}
export const empty = (title,description,action='') => `<div class="empty">${icon('leaf')}<h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
export function dialog(title,subtitle,body,wide=false) {
  const el=$('#dialog');el.classList.toggle('wide',wide);el.innerHTML=`<div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="icon-button" data-action="close" aria-label="Закрыть">${icon('close')}</button></div>${body}`;
  if(!el.open)el.showModal();return el;
}
export const closeDialog = () => $('#dialog').close();
export function confirmAction(title,message,onConfirm) {
  const el=dialog(title,'',`<div class="confirm-body"><p>${esc(message)}</p><div class="row"><button class="btn" id="confirm-button">Подтвердить</button><button class="btn secondary" data-action="close">Назад</button></div><div class="form-error" role="alert"></div></div>`);
  $('#confirm-button',el).onclick=async e=>{e.currentTarget.disabled=true;try{await onConfirm();closeDialog();}catch(error){$('.form-error',el).textContent=error.message;$('#confirm-button',el).disabled=false;}};
}
export function formError(form,error){const el=$('.form-error',form);if(el)el.textContent=error.message;else toast(error.message,true);}
export function card(s) {
  return `<article class="service-card">${favoriteButton(s.id)}<a href="#/services/${s.id}" class="service-picture ${esc(s.category)}" aria-label="${esc(s.title)}"><img src="/assets/room.svg" alt="Светлая комната после уборки — иллюстрация" loading="lazy"><span class="picture-tag">${esc(categoryName(s.category))}</span><span class="picture-arrow">${icon('arrow')}</span></a><div class="service-body"><a href="#/services/${s.id}"><h3>${esc(s.title)}</h3></a><p>${esc(s.desc)}</p><div class="service-meta">${icon('clock')} ${esc(s.duration||minutes(s.durationMinutes))}<span>·</span>${icon('pin')} ${esc(s.city)}</div><div class="service-price"><div><small>от </small><strong>${money(s.price)}</strong></div><span class="rating">${s.reviews?`${icon('star')} ${Number(s.rating).toFixed(1)} <span class="muted">(${s.reviews})</span>`:'Пока без отзывов'}</span></div></div></article>`;
}
