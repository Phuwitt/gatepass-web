import {$,api} from './shared.js';
$('#login-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('login',{code:$('#owner-code').value});location.href=new URL(location.href).searchParams.get('next')==='/admin'?'/admin':'/';}catch(err){$('#error').textContent=err.message;}finally{button.disabled=false;}};
