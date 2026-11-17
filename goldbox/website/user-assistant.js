// Chat is ephemeral and deliberately never reads the current song or browser URL.
(() => {
  const form=document.getElementById("assistant-form"), input=document.getElementById("assistant-prompt"), messages=document.getElementById("assistant-messages"), status=document.getElementById("assistant-status"), send=document.getElementById("assistant-send"), clear=document.getElementById("assistant-clear");
  if(!form)return;
  let history=[], pending=false, generation=0;
  function show(role,text){
    const turn=document.createElement("p"), label=document.createElement("strong");
    label.textContent=role==="user"?"You: ":"Assistant: ";
    turn.append(label,document.createTextNode(text));messages.append(turn);
    while(messages.children.length>10)messages.firstElementChild.remove();
    messages.scrollTop=messages.scrollHeight;
  }
  // Keep editor shortcuts from intercepting text entry or chat buttons.
  form.addEventListener("keydown",e=>e.stopPropagation());
  form.addEventListener("keyup",e=>e.stopPropagation());
  clear.addEventListener("click",()=>{generation++;history=[];messages.replaceChildren();input.value="";status.textContent="";pending=false;send.disabled=false;});
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const prompt=input.value.trim();if(pending||prompt.length<3||prompt.length>500){if(!pending)status.textContent="Write a question of 3–500 characters.";return;}
    const id=++generation;pending=true;send.disabled=true;status.textContent="Thinking…";show("user",prompt);input.value="";
    try{
      const response=await fetch("/api/features",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt,history})});
      const data=await response.json();if(!response.ok)throw Error(data.error||"Request failed.");
      if(typeof data.reply!=="string")throw Error("No answer received.");
      if(id!==generation)return;
      show("model",data.reply);history=[...history,{role:"user",text:prompt},{role:"model",text:data.reply}].slice(-8);status.textContent="";
    }catch(error){if(id===generation)status.textContent=error.message||"Unable to answer. Try again.";}
    finally{if(id===generation){pending=false;send.disabled=false;}}
  });
})();