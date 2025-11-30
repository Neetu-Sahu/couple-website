const form = document.getElementById('memory-form');
const memoryContainer = document.getElementById('memory-container');

function getAuthHeaders(contentType) {
    const token = localStorage.getItem('memoriesToken');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (contentType) headers['Content-Type'] = contentType;
    return headers;
}

// Load existing memories from backend (or fallback to localStorage)
async function loadMemories() {
    memoryContainer.innerHTML = '';
    try {
        const token = localStorage.getItem('memoriesToken');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('/memories', { headers });
        if (res.status === 401) { window.location.href = 'password.html'; return; }
            if (!res.ok) throw new Error('Network response was not ok');
            const memories = await res.json();
            memories.forEach(mem => {
                const div = document.createElement('div');
                div.classList.add('memory-card');
                    div.innerHTML = `
                        <img src="${mem.imageUrl}" alt="Memory">
                        <h3>${mem.name || ''}</h3>
                        <p>${mem.caption || ''}</p>
                        <small>${mem.details || ''}</small>
                        <div style='margin-top:8px;display:flex;gap:8px;justify-content:center;'>
                          <button class='edit btn' style='background:#6bffb8;color:#111'>Edit</button>
                          <button class='delete btn' style='background:#ff6b9a'>Delete</button>
                        </div>
                    `;
                memoryContainer.appendChild(div);
                    // Edit handler
                    const editBtn = div.querySelector('.edit');
                    editBtn.addEventListener('click', async () => {
                        const newCaption = prompt('Edit caption', mem.caption || '');
                        const newName = prompt('Edit name', mem.name || '');
                        if (newCaption === null && newName === null) return;
                        if (mem.id) {
                            try {
                                const headers = getAuthHeaders('application/json');
                                const resp = await fetch(`/memories/${encodeURIComponent(mem.id)}`, { method: 'PUT', headers, body: JSON.stringify({ caption: (newCaption !== null ? newCaption : mem.caption), name: (newName !== null ? newName : mem.name) }) });
                                if (resp.status === 401) { window.location.href = 'password.html'; return; }
                                if (resp.ok) return loadMemories();
                                const err = await resp.json().catch(()=>({})); alert(err.error || 'Failed to update on server');
                            } catch (err) { alert('Network error while updating'); }
                        } else {
                            // fallback: try localStorage fallback list
                            const local = JSON.parse(localStorage.getItem('memories') || '[]');
                            const idx = local.findIndex(x => x.caption === mem.caption && x.name === mem.name);
                            if (idx !== -1) {
                                local[idx].caption = newCaption !== null ? newCaption : local[idx].caption;
                                local[idx].name = newName !== null ? newName : local[idx].name;
                                localStorage.setItem('memories', JSON.stringify(local));
                                loadMemories();
                            }
                        }
                    });
                    // Delete handler
                    const deleteBtn = div.querySelector('.delete');
                    deleteBtn.addEventListener('click', async () => {
                        if (!confirm('Delete this memory?')) return;
                        if (mem.id) {
                            try {
                                const headers = getAuthHeaders();
                                const resp = await fetch(`/memories/${encodeURIComponent(mem.id)}`, { method: 'DELETE', headers });
                                if (resp.status === 401) { window.location.href = 'password.html'; return; }
                                if (resp.ok) return loadMemories();
                                const err = await resp.json().catch(()=>({})); alert(err.error || 'Failed to delete on server');
                            } catch (err) { alert('Network error while deleting'); }
                        } else {
                            // fallback local deletion
                            const local = JSON.parse(localStorage.getItem('memories') || '[]');
                            const idx = local.findIndex(x => x.caption === mem.caption && x.name === mem.name);
                            if (idx !== -1) { local.splice(idx,1); localStorage.setItem('memories', JSON.stringify(local)); loadMemories(); }
                        }
                    });
            });
            return;
        } catch (err) {
            // fallback to localStorage
            const fallback = JSON.parse(localStorage.getItem('memories') || '[]');
            fallback.forEach((mem, idx) => {
                const div = document.createElement('div');
                div.classList.add('memory-card');
                div.innerHTML = `
                    <img src="${mem.src}" alt="Memory">
                    <h3>${mem.name || 'You'}</h3>
                    <p>${mem.caption}</p>
                    <small>${mem.details || ''}</small>
                    <div style='margin-top:8px;display:flex;gap:8px;justify-content:center;'>
                      <button class='edit btn' style='background:#6bffb8;color:#111'>Edit</button>
                      <button class='delete btn' style='background:#ff6b9a'>Delete</button>
                    </div>
                `;
                memoryContainer.appendChild(div);
                const editBtn = div.querySelector('.edit');
                editBtn.onclick = () => {
                    const newCaption = prompt('Edit caption', mem.caption || '');
                    const newName = prompt('Edit name', mem.name || '');
                    if (newCaption !== null) mem.caption = newCaption;
                    if (newName !== null) mem.name = newName;
                    const local = JSON.parse(localStorage.getItem('memories') || '[]');
                    if (local[idx]) { local[idx].caption = mem.caption; local[idx].name = mem.name; localStorage.setItem('memories', JSON.stringify(local)); }
                    loadMemories();
                };
                const deleteBtn = div.querySelector('.delete');
                deleteBtn.onclick = () => {
                    if (!confirm('Delete this memory?')) return;
                    const local = JSON.parse(localStorage.getItem('memories') || '[]');
                    local.splice(idx, 1);
                    localStorage.setItem('memories', JSON.stringify(local));
                    loadMemories();
                };
            });
        }
}

// Load memories on page load
loadMemories();

// Handle form submission for new memory (guard the form exists)
if (form) {
    form.addEventListener('submit', e => {
           e.preventDefault();
    const formData = new FormData(form);
    const data = {
        name: formData.get('name'),
        caption: formData.get('caption'),
        details: formData.get('details'),
        imageUrl: formData.get('imageUrl')
    };

    fetch('/add-memory', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(res => {
        // use backticks for template string
        alert(`Memory added! Total memories: ${res.count}`);
        form.reset();
        loadMemories();
    })
    .catch(err => console.log(err));
    });
}