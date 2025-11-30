// Load memories from backend (guard container exists)
const memoryContainer = document.getElementById('memory-container');

if (memoryContainer) {
    fetch('http://localhost:3000')
    .then(res => res.json())
    .then(memories => {
        memories.forEach(mem => {
            const div = document.createElement('div');
            div.classList.add('memory-card');
            div.innerHTML = `
                <img src="${mem.imageUrl}" alt="Memory">
                <h3>${mem.name}</h3>
                <p>${mem.caption}</p>
                <small>${mem.details}</small>
            `;
            memoryContainer.appendChild(div);
        });
    })
    .catch(err => console.log(err));
}