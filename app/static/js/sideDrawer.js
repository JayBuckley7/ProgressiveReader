function initSideDrawer() {
    const drawer = document.getElementById('side-drawer');
    const toggleDrawerBtn = document.getElementById('toggle-drawer-btn');
    const drawerCloseBtn = document.querySelector('#side-drawer .close-btn');

    if (!drawer || !toggleDrawerBtn || !drawerCloseBtn) {
        console.warn("Side drawer elements not found, skipping initialization.");
        return;
    }

    toggleDrawerBtn.addEventListener('click', () => {
        drawer.classList.toggle('open');
        // Optional: Toggle body class if needed for margin adjustments
        document.body.classList.toggle('drawer-open'); 
    });

    drawerCloseBtn.addEventListener('click', () => {
        drawer.classList.remove('open');
        document.body.classList.remove('drawer-open');
    });
    
//     console.log("SideDrawer initialized.");
}

// Expose if needed, but init pattern is better
window.sideDrawerManager = {
    initSideDrawer
}; 