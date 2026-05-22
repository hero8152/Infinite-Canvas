(function(){
    function attach(opts={}){
        const root = opts.root || document;
        const selected = new Set();
        function keyFor(el){ return el.dataset.id || el.dataset.timestamp || el.getAttribute('data-history-id') || ''; }
        function sync(){
            root.querySelectorAll('[data-history-id], [data-timestamp]').forEach(el => {
                el.classList.toggle('studio-history-selected', selected.has(keyFor(el)));
            });
        }
        root.addEventListener('click', e => {
            const card = e.target.closest('[data-history-id], [data-timestamp]');
            if(!card || !(e.metaKey || e.ctrlKey || e.shiftKey)) return;
            const key = keyFor(card);
            if(!key) return;
            e.preventDefault();
            if(selected.has(key)) selected.delete(key); else selected.add(key);
            sync();
        });
        return {
            selected: () => [...selected],
            clear: () => { selected.clear(); sync(); },
            remove: async () => {
                const items = [...selected];
                if(opts.onDelete) await opts.onDelete(items);
                selected.clear();
                sync();
            }
        };
    }
    const style = document.createElement('style');
    style.textContent = '.studio-history-selected{outline:2px solid var(--primary,#fa520f)!important;outline-offset:-2px!important;}';
    document.head.appendChild(style);
    window.StudioHistoryBulkManager = {attach};
})();
